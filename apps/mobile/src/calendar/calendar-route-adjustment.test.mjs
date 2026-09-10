import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  childProps: null,
  database: { name: 'calendar-db' },
  feedbackProps: null,
  listWindow: vi.fn(),
  openDatabase: vi.fn(),
  requireDeviceId: vi.fn(),
  restore: vi.fn(),
  routerPush: vi.fn(),
  saveAdjustment: vi.fn(),
}));

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    StyleSheet: { create: (styles) => styles },
    View: ({ children, ...props }) => createReactElement('View', props, children),
    useColorScheme: () => 'light',
  };
});

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => ({ push: state.routerPush }),
    useFocusEffect: (effect) => {
      useEffect(effect, [effect]);
    },
  };
});

vi.mock('../auth/auth-runtime.js', () => ({
  rootAuthController: { restore: state.restore },
  rootAuthStorage: { read: vi.fn(async () => null) },
}));

vi.mock('../storage/database.js', () => ({
  openMobileDatabase: state.openDatabase,
}));

vi.mock('../storage/local-repositories.js', () => ({
  createLocalRepositories: () => ({
    calendar: { listWindow: state.listWindow },
    settings: { get: vi.fn(async () => null) },
  }),
}));

vi.mock('../sync/root-sync-runtime.js', () => ({
  requireRegisteredDeviceId: state.requireDeviceId,
}));

vi.mock('./calendar-language-runtime.js', () => ({
  resolveInitialCalendarLanguage: () => 'en',
  resolveCalendarLanguage: vi.fn(async () => ({ language: 'en' })),
}));

vi.mock('./calendar-mission-create.js', () => ({
  createCalendarMission: vi.fn(async () => undefined),
}));

vi.mock('./calendar-mission-adjustment-save.js', () => ({
  saveCalendarMissionAdjustment: state.saveAdjustment,
}));

vi.mock('./calendar-mission-adjustment-feedback.js', async () => {
  const { createElement: createReactElement, useEffect } = await import('react');
  return {
    MissionAdjustmentFeedback: (props) => {
      state.feedbackProps = props;
      useEffect(
        () => () => {
          state.feedbackProps = null;
        },
        [],
      );
      return createReactElement('MissionAdjustmentFeedback', props);
    },
  };
});

vi.mock('./calendar-day-screen.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    CalendarDayScreen: (props) => {
      state.childProps = props;
      return createReactElement('CalendarDayScreen', props);
    },
  };
});

import { CalendarRouteScreen } from './calendar-route-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  state.childProps = null;
  state.feedbackProps = null;
  state.listWindow.mockReset().mockResolvedValue([]);
  state.openDatabase.mockReset().mockResolvedValue(state.database);
  state.requireDeviceId.mockReset().mockResolvedValue('22222222-2222-4222-8222-222222222222');
  state.restore.mockReset().mockResolvedValue({
    status: 'signed_in',
    session: {
      accountId: '11111111-1111-4111-8111-111111111111',
    },
  });
  state.routerPush.mockReset();
  state.saveAdjustment.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function allowedAdjustment() {
  return {
    allowed: true,
    missionId: '44444444-4444-4444-8444-444444444444',
    kind: 'move',
    previousStartMinute: 540,
    previousEndMinute: 600,
    startMinute: 555,
    endMinute: 615,
    rewardEligibility: 'ineligible',
    warning: 'past_zero_xp',
  };
}

function routeMission({
  id,
  title,
  allDay,
  localStart,
  localFinish,
  completionState = 'incomplete',
}) {
  return {
    series: { id: `series-${id}`, title, recurrence: null },
    occurrence: {
      id,
      seriesId: `series-${id}`,
      schedule: {
        localStart,
        localFinish,
        startInstant: `${localStart}.000Z`,
        finishInstant: `${localFinish}.000Z`,
        timeZone: 'UTC',
        timeBehavior: 'local_time',
        allDay,
        estimatedEffortMinutes: allDay ? 30 : null,
      },
      scheduleState: 'scheduled',
      completionState,
      evidenceState: completionState === 'completed' ? 'accepted' : 'not_submitted',
      rewardEligibility: 'eligible',
      rewardIssuance: completionState === 'completed' ? 'issued' : 'not_issued',
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      synchronizationState: 'synced',
      storyState: 'none',
      deletionState: 'active',
    },
  };
}

describe('Calendar production route', () => {
  it('saves immediately and makes visible Undo a second synchronized save without restoring XP', async () => {
    vi.useFakeTimers();
    let renderer;
    await act(async () => {
      renderer = create(createElement(CalendarRouteScreen));
      await Promise.resolve();
    });

    expect(state.childProps).not.toBeNull();
    await act(async () => {
      await state.childProps.onMissionAdjustment(allowedAdjustment());
    });

    expect(state.saveAdjustment).toHaveBeenCalledTimes(1);
    expect(state.saveAdjustment.mock.calls[0][0]).toMatchObject({
      database: state.database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      adjustment: {
        missionId: '44444444-4444-4444-8444-444444444444',
        startMinute: 555,
        endMinute: 615,
        rewardEligibility: 'ineligible',
        source: 'move',
      },
    });
    expect(state.feedbackProps).toMatchObject({
      adjustment: allowedAdjustment(),
      colorScheme: 'light',
      language: 'en',
    });

    await act(async () => {
      await state.feedbackProps.onUndo();
    });

    expect(state.saveAdjustment).toHaveBeenCalledTimes(2);
    expect(state.saveAdjustment.mock.calls[1][0]).toMatchObject({
      adjustment: {
        missionId: '44444444-4444-4444-8444-444444444444',
        startMinute: 540,
        endMinute: 600,
        rewardEligibility: 'ineligible',
        source: 'undo',
      },
    });
    expect(state.feedbackProps).toBeNull();

    act(() => renderer.unmount());
  });

  it('loads timed and all-day missions and opens Mission Details from either card type', async () => {
    state.listWindow.mockResolvedValue([
      routeMission({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Timed mission',
        allDay: false,
        localStart: '2026-09-08T09:15:00',
        localFinish: '2026-09-08T10:00:00',
      }),
      routeMission({
        id: '55555555-5555-4555-8555-555555555555',
        title: 'All-day mission',
        allDay: true,
        localStart: '2026-09-08T00:00:00',
        localFinish: '2026-09-09T00:00:00',
        completionState: 'completed',
      }),
    ]);

    let renderer;
    await act(async () => {
      renderer = create(createElement(CalendarRouteScreen));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.childProps.timedMissionsByDate['2026-09-08']).toEqual([
      expect.objectContaining({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Timed mission',
        startMinute: 555,
        endMinute: 600,
      }),
    ]);
    expect(state.childProps.allDayMissionsByDate['2026-09-08']).toEqual([
      expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        title: 'All-day mission',
        completed: true,
      }),
    ]);

    await act(async () => {
      state.childProps.onTimedMissionPress({ id: '44444444-4444-4444-8444-444444444444' });
    });
    await act(async () => {
      state.childProps.onTimedMissionPress({ id: '44444444-4444-4444-8444-444444444444' });
    });
    await act(async () => {
      state.childProps.onAllDayMissionPress({ id: '55555555-5555-4555-8555-555555555555' });
    });
    await act(async () => {
      state.childProps.onAllDayMissionPress({ id: '55555555-5555-4555-8555-555555555555' });
    });

    expect(state.routerPush).toHaveBeenNthCalledWith(1, {
      pathname: '/mission/[id]',
      params: { id: '44444444-4444-4444-8444-444444444444' },
    });
    expect(state.routerPush).toHaveBeenNthCalledWith(2, {
      pathname: '/mission/[id]',
      params: { id: '55555555-5555-4555-8555-555555555555' },
    });

    act(() => renderer.unmount());
  });
});

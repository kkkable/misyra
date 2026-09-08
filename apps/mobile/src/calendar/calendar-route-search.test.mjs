import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  dayProps: null,
  searchProps: null,
  listWindow: vi.fn(),
  getById: vi.fn(),
  searchQuery: vi.fn(),
  restore: vi.fn(),
  routerPush: vi.fn(),
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
  openMobileDatabase: vi.fn(async () => ({ name: 'calendar-db' })),
}));

vi.mock('../storage/local-repositories.js', () => ({
  createLocalRepositories: () => ({
    calendar: { listWindow: state.listWindow },
    missions: { getById: state.getById },
    settings: { get: vi.fn(async () => null) },
  }),
}));

vi.mock('../search/offline-search.js', () => ({
  createOfflineCalendarSearch: () => ({ query: state.searchQuery }),
}));

vi.mock('../search/calendar-search-screen.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    CalendarSearchScreen: (props) => {
      state.searchProps = props;
      return createReactElement('CalendarSearchScreen', props);
    },
  };
});

vi.mock('../sync/root-sync-runtime.js', () => ({
  requireRegisteredDeviceId: vi.fn(async () => '22222222-2222-4222-8222-222222222222'),
}));

vi.mock('./calendar-language-runtime.js', () => ({
  resolveInitialCalendarLanguage: () => 'en',
  resolveCalendarLanguage: vi.fn(async () => ({ language: 'en' })),
}));

vi.mock('./calendar-mission-create.js', () => ({
  createCalendarMission: vi.fn(async () => undefined),
}));

vi.mock('./calendar-mission-adjustment-save.js', () => ({
  saveCalendarMissionAdjustment: vi.fn(async () => undefined),
}));

vi.mock('./calendar-mission-adjustment-feedback.js', () => ({
  MissionAdjustmentFeedback: () => null,
}));

vi.mock('./calendar-day-screen.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    CalendarDayScreen: (props) => {
      state.dayProps = props;
      return createReactElement('CalendarDayScreen', props);
    },
  };
});

import { CalendarRouteScreen } from './calendar-route-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function distantMission() {
  return {
    series: {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Archived mission',
      recurrence: null,
    },
    occurrence: {
      id: '44444444-4444-4444-8444-444444444444',
      seriesId: '33333333-3333-4333-8333-333333333333',
      schedule: {
        localStart: '2020-01-15T10:30:00',
        localFinish: '2020-01-15T11:00:00',
        startInstant: '2020-01-15T10:30:00.000Z',
        finishInstant: '2020-01-15T11:00:00.000Z',
        timeZone: 'UTC',
        timeBehavior: 'local_time',
        allDay: false,
        estimatedEffortMinutes: null,
      },
      scheduleState: 'scheduled',
      completionState: 'incomplete',
      evidenceState: 'not_submitted',
      rewardEligibility: 'eligible',
      rewardIssuance: 'not_issued',
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      synchronizationState: 'synced',
      storyState: 'none',
      deletionState: 'active',
    },
  };
}

beforeEach(() => {
  state.dayProps = null;
  state.searchProps = null;
  state.listWindow.mockReset().mockResolvedValue([]);
  state.getById.mockReset().mockResolvedValue(distantMission());
  state.searchQuery.mockReset().mockResolvedValue([
    {
      documentId: 'archive-result',
      occurrenceId: '44444444-4444-4444-8444-444444444444',
      title: 'Archived mission',
      location: null,
      providerText: null,
      personalNoteExcerpt: null,
    },
  ]);
  state.restore.mockReset().mockResolvedValue({
    status: 'signed_in',
    session: { accountId: '11111111-1111-4111-8111-111111111111' },
  });
  state.routerPush.mockReset();
});

describe('MTS-049 Calendar route search navigation', () => {
  it('projects a search hit outside the normal Calendar cache window before focusing it', async () => {
    let renderer;
    await act(async () => {
      renderer = create(createElement(CalendarRouteScreen));
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => state.dayProps.onSearchPress());
    const [result] = await state.searchProps.search('Archived');

    await act(async () => {
      await state.searchProps.onOpenResult(result);
    });

    expect(state.dayProps.searchFocusTarget).toMatchObject({
      date: '2020-01-15',
      minute: 630,
      missionId: '44444444-4444-4444-8444-444444444444',
    });
    expect(state.dayProps.timedMissionsByDate['2020-01-15']).toEqual([
      expect.objectContaining({
        id: '44444444-4444-4444-8444-444444444444',
        startMinute: 630,
        endMinute: 660,
      }),
    ]);

    act(() => renderer.unmount());
  });
});

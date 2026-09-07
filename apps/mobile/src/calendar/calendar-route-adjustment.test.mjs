import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  childProps: null,
  database: { name: 'calendar-db' },
  feedbackProps: null,
  openDatabase: vi.fn(),
  requireDeviceId: vi.fn(),
  restore: vi.fn(),
  saveAdjustment: vi.fn(),
}));

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    View: ({ children, ...props }) => createReactElement('View', props, children),
    useColorScheme: () => 'light',
  };
});

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('../auth/auth-runtime.js', () => ({
  rootAuthController: { restore: state.restore },
  rootAuthStorage: { read: vi.fn(async () => null) },
}));

vi.mock('../storage/database.js', () => ({
  openMobileDatabase: state.openDatabase,
}));

vi.mock('../storage/local-repositories.js', () => ({
  createLocalRepositories: () => ({ settings: { get: vi.fn(async () => null) } }),
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
  const { createElement: createReactElement } = await import('react');
  return {
    MissionAdjustmentFeedback: (props) => {
      state.feedbackProps = props;
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
  state.openDatabase.mockReset().mockResolvedValue(state.database);
  state.requireDeviceId.mockReset().mockResolvedValue('22222222-2222-4222-8222-222222222222');
  state.restore.mockReset().mockResolvedValue({
    status: 'signed_in',
    session: {
      accountId: '11111111-1111-4111-8111-111111111111',
    },
  });
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

describe('MTS-047 Calendar route adjustment persistence', () => {
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
});

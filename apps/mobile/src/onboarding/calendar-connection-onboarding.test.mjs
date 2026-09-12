import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    Modal: 'Modal',
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
    Switch: 'Switch',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    useColorScheme: () => 'light',
  };
});

import {
  calendarConnectionMessagesForLocale,
  createCalendarConnectionFlowController,
} from './calendar-connection-flow.js';
import { OnboardingGate } from './onboarding-gate.js';

const onboardingMessages = {
  notificationsTitle: 'Mission reminders',
  notificationsBody: 'Notifications remind you when a mission starts.',
  enableNotifications: 'Enable notifications',
  notNow: 'Not now',
  calendarTitle: 'Connect a calendar?',
  calendarBody: 'Optionally connect one calendar.',
  appleCalendar: 'Apple Calendar',
  googleCalendar: 'Google Calendar',
  skipCalendar: 'Skip for now',
};

describe('MTS-068 onboarding handoff', () => {
  it('does not request provider permission until direction passes both confirmations', async () => {
    const controller = {
      restore: vi.fn(async () => ({ language: 'en', step: 'calendar' })),
      chooseNotifications: vi.fn(),
      chooseCalendarProvider: vi.fn(async () => ({ language: 'en', step: 'complete' })),
    };
    const gateway = {
      hasActiveConnection: vi.fn(async () => false),
      onConfirmed: vi.fn(async () => undefined),
    };
    const calendarConnectionController = createCalendarConnectionFlowController({ gateway });
    let renderer;

    await act(async () => {
      renderer = create(
        createElement(
          OnboardingGate,
          {
            calendarConnectionController,
            calendarConnectionMessages: calendarConnectionMessagesForLocale('en'),
            controller,
            messages: onboardingMessages,
          },
          createElement('CalendarApp'),
        ),
      );
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'onboarding-calendar-google' }).props.onPress();
      await Promise.resolve();
    });
    expect(controller.chooseCalendarProvider).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'calendar-direction-external' })).toBeTruthy();

    act(() => renderer.root.findByProps({ testID: 'calendar-direction-external' }).props.onPress());
    expect(controller.chooseCalendarProvider).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: 'calendar-direction-continue' }).props.onPress();
      await Promise.resolve();
    });
    expect(controller.chooseCalendarProvider).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: 'calendar-direction-confirm' }).props.onPress();
      await Promise.resolve();
    });

    expect(gateway.onConfirmed).toHaveBeenCalledOnce();
    expect(controller.chooseCalendarProvider).toHaveBeenCalledWith('google');
    expect(renderer.root.findByType('CalendarApp')).toBeTruthy();
  });

  it('coalesces rapid final confirmation presses so provider permission is requested once', async () => {
    let releaseHandoff;
    const handoff = new Promise((resolve) => {
      releaseHandoff = resolve;
    });
    const controller = {
      restore: vi.fn(async () => ({ language: 'en', step: 'calendar' })),
      chooseNotifications: vi.fn(),
      chooseCalendarProvider: vi.fn(async () => ({ language: 'en', step: 'complete' })),
    };
    const gateway = {
      hasActiveConnection: vi.fn(async () => false),
      onConfirmed: vi.fn(async () => handoff),
    };
    const calendarConnectionController = createCalendarConnectionFlowController({ gateway });
    let renderer;

    await act(async () => {
      renderer = create(
        createElement(
          OnboardingGate,
          {
            calendarConnectionController,
            calendarConnectionMessages: calendarConnectionMessagesForLocale('en'),
            controller,
            messages: onboardingMessages,
          },
          createElement('CalendarApp'),
        ),
      );
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'onboarding-calendar-google' }).props.onPress();
      await Promise.resolve();
    });
    act(() => renderer.root.findByProps({ testID: 'calendar-direction-external' }).props.onPress());
    await act(async () => {
      renderer.root.findByProps({ testID: 'calendar-direction-continue' }).props.onPress();
      await Promise.resolve();
    });

    const confirm = renderer.root.findByProps({ testID: 'calendar-direction-confirm' });
    act(() => {
      confirm.props.onPress();
      confirm.props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(gateway.onConfirmed).toHaveBeenCalledOnce();
    expect(controller.chooseCalendarProvider).not.toHaveBeenCalled();

    await act(async () => {
      releaseHandoff();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(gateway.onConfirmed).toHaveBeenCalledOnce();
    expect(controller.chooseCalendarProvider).toHaveBeenCalledTimes(1);
    expect(controller.chooseCalendarProvider).toHaveBeenCalledWith('google');
  });
});

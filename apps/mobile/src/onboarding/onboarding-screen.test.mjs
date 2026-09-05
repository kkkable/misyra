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
  };
});

import { OnboardingScreen } from './onboarding-screen.js';

const messages = {
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

describe('MTS-038 onboarding choice UI', () => {
  it('explains notifications before exposing Enable notifications and Not now actions', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(OnboardingScreen, {
          colorScheme: 'light',
          messages,
          state: { language: 'en', step: 'notifications' },
          onNotificationChoice: vi.fn(),
          onCalendarChoice: vi.fn(),
        }),
      );
    });

    expect(renderer.root.findByProps({ children: messages.notificationsBody })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'onboarding-enable-notifications' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'onboarding-not-now' })).toBeTruthy();
    expect(
      renderer.root.findAll((node) => node.props?.testID === 'onboarding-calendar-google'),
    ).toHaveLength(0);
  });

  it('offers an optional calendar provider choice only on the calendar step', () => {
    const onCalendarChoice = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(OnboardingScreen, {
          colorScheme: 'dark',
          messages,
          state: { language: 'en', step: 'calendar' },
          onNotificationChoice: vi.fn(),
          onCalendarChoice,
        }),
      );
    });

    act(() => renderer.root.findByProps({ testID: 'onboarding-calendar-google' }).props.onPress());
    expect(onCalendarChoice).toHaveBeenCalledWith('google');

    act(() => renderer.root.findByProps({ testID: 'onboarding-calendar-skip' }).props.onPress());
    expect(onCalendarChoice).toHaveBeenCalledWith(null);
  });

  it('contains no camera, photo-save, location, health, or diagnostics prompt surface', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(OnboardingScreen, {
          colorScheme: 'light',
          messages,
          state: { language: 'en', step: 'calendar' },
          onNotificationChoice: vi.fn(),
          onCalendarChoice: vi.fn(),
        }),
      );
    });

    for (const testID of [
      'onboarding-camera',
      'onboarding-photo-save',
      'onboarding-location',
      'onboarding-health',
      'onboarding-diagnostics',
    ]) {
      expect(renderer.root.findAll((node) => node.props?.testID === testID)).toHaveLength(0);
    }
  });
});

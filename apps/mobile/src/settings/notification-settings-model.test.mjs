import { describe, expect, it } from 'vitest';

import { createNotificationSettingsModel } from './notification-settings-model.js';

const messages = Object.freeze({
  title: 'Settings',
  notifications: 'Notifications',
  enabled: 'Enabled',
  denied: 'Denied',
  notEnabled: 'Not enabled',
  unavailable: 'Unavailable',
  enable: 'Enable notifications',
  openSettings: 'Open system settings',
});

describe('MTS-062 Settings notification status model', () => {
  it('shows enabled system state without another permission action', () => {
    expect(
      createNotificationSettingsModel({
        messages,
        permission: { status: 'enabled', canRequest: false },
      }),
    ).toEqual({
      title: 'Settings',
      label: 'Notifications',
      statusLabel: 'Enabled',
      action: null,
    });
  });

  it('shows system denial and offers another prompt only when the OS still allows asking', () => {
    expect(
      createNotificationSettingsModel({
        messages,
        permission: { status: 'denied', canRequest: true },
      }),
    ).toEqual({
      title: 'Settings',
      label: 'Notifications',
      statusLabel: 'Denied',
      action: { kind: 'request', label: 'Enable notifications' },
    });
  });

  it('shows hard system denial and routes the explicit recovery action to system settings', () => {
    expect(
      createNotificationSettingsModel({
        messages,
        permission: { status: 'denied', canRequest: false },
      }),
    ).toEqual({
      title: 'Settings',
      label: 'Notifications',
      statusLabel: 'Denied',
      action: { kind: 'open_settings', label: 'Open system settings' },
    });
  });

  it('shows not-enabled state before the first system prompt and keeps permission opt-in explicit', () => {
    expect(
      createNotificationSettingsModel({
        messages,
        permission: { status: 'not_determined', canRequest: true },
      }),
    ).toEqual({
      title: 'Settings',
      label: 'Notifications',
      statusLabel: 'Not enabled',
      action: { kind: 'request', label: 'Enable notifications' },
    });
  });

  it('shows unavailable status without inventing a coercive action', () => {
    expect(
      createNotificationSettingsModel({
        messages,
        permission: { status: 'unavailable', canRequest: false },
      }),
    ).toEqual({
      title: 'Settings',
      label: 'Notifications',
      statusLabel: 'Unavailable',
      action: null,
    });
  });
});

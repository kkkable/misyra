import { describe, expect, it } from 'vitest';

import { accountSettingsSchema, accountSettingsUpdateSchema } from './device-settings.js';

describe('MTS-105 diagnostics account setting', () => {
  it('defaults diagnostics to enabled in the full settings contract', () => {
    expect(
      accountSettingsSchema.parse({
        language: 'en',
        trustMode: false,
        diagnosticsEnabled: true,
      }),
    ).toMatchObject({ diagnosticsEnabled: true });
  });

  it('accepts an explicit diagnostics opt-out patch', () => {
    expect(accountSettingsUpdateSchema.parse({ diagnosticsEnabled: false })).toEqual({
      diagnosticsEnabled: false,
    });
  });
});

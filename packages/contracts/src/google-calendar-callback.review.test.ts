import { describe, expect, it } from 'vitest';

import { googleCalendarCallbackQuerySchema } from './external-calendar.js';

describe('MTS-069 Google OAuth callback contract', () => {
  it('accepts provider-added callback parameters while extracting required state and code', () => {
    const parsed = googleCalendarCallbackQuerySchema.parse({
      state: 'opaque-state',
      code: 'authorization-code',
      scope: 'https://www.googleapis.com/auth/calendar',
      authuser: '0',
      prompt: 'consent',
    });

    expect(parsed).toMatchObject({
      state: 'opaque-state',
      code: 'authorization-code',
    });
  });
});

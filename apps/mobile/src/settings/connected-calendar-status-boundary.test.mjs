import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const settingsSourceUrl = new URL('./settings-route.tsx', import.meta.url);
const calendarSourceUrl = new URL('../calendar/calendar-route-screen.tsx', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

describe('MTS-075 Connected Calendar status boundary', () => {
  it('renders provider connection state only in Settings and never as a Calendar warning', async () => {
    const [settingsSource, calendarSource] = await Promise.all([
      source(settingsSourceUrl),
      source(calendarSourceUrl),
    ]);

    expect(settingsSource).toContain('settings-connected-calendar');
    expect(settingsSource).toContain('settings-connected-calendar-status');
    expect(settingsSource).toContain('provider_unavailable');
    expect(settingsSource).toContain('permission_revoked');

    for (const forbidden of [
      'provider_unavailable',
      'permission_revoked',
      'calendar-provider-warning',
      'connected-calendar-warning',
    ]) {
      expect(calendarSource).not.toContain(forbidden);
    }
  });
});

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { externalCalendarConnections } from './schema.js';

describe('MTS-069 Google calendar schema parity', () => {
  it('models every connection and OAuth-state column added by migration 0010', () => {
    const columns = getTableConfig(externalCalendarConnections).columns.map(
      (column) => column.name,
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'provider_calendar_id',
        'encrypted_refresh_token',
        'connection_state',
        'oauth_state_hash',
        'oauth_state_expires_at',
        'oauth_state_consumed_at',
      ]),
    );
  });
});

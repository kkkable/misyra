import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { accounts, accountSessions } from './schema.js';

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe('MTS-034 auth schema parity', () => {
  it('models provider nonce replay state in the typed accounts schema', () => {
    expect(columnNames(accounts)).toContain('consumed_provider_nonce_hashes');
  });

  it('models refresh-token family and rotation state in the typed session schema', () => {
    expect(columnNames(accountSessions)).toEqual(
      expect.arrayContaining(['family_id', 'rotated_refresh_token_hashes']),
    );
  });
});

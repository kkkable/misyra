import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { accounts, accountSessions } from './schema.js';

describe('MTS-034 auth schema parity', () => {
  it('models provider nonce replay state in the typed accounts schema', () => {
    const accountColumns = getTableConfig(accounts).columns.map((column) => column.name);
    expect(accountColumns).toContain('consumed_provider_nonce_hashes');
  });

  it('models refresh-token family and rotation state in the typed session schema', () => {
    const sessionColumns = getTableConfig(accountSessions).columns.map((column) => column.name);
    expect(sessionColumns).toEqual(
      expect.arrayContaining(['family_id', 'rotated_refresh_token_hashes']),
    );
  });
});

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { devices } from './schema.js';

describe('MTS-053 device time-zone schema parity', () => {
  it('declares the migrated devices.time_zone column in Drizzle', () => {
    const columnNames = getTableConfig(devices).columns.map((column) => column.name);
    expect(columnNames).toContain('time_zone');
  });
});

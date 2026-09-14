import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { hiddenExternalEvents } from './schema.js';

describe('MTS-073 hidden-event schema metadata', () => {
  it('keeps the Drizzle declaration aligned with provider and effective-range migration columns', () => {
    const columns = getTableConfig(hiddenExternalEvents).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'provider',
        'provider_calendar_id',
        'provider_event_id',
        'recurrence_scope',
        'effective_start',
        'effective_end',
        'hidden_at',
      ]),
    );
  });
});

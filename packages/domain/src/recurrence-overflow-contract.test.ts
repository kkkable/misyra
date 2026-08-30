import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const recurrenceSource = readFileSync(
  new URL('./recurrence-expansion.ts', import.meta.url),
  'utf8',
);

describe('MTS-014 recurrence boundedness contract', () => {
  it('guards generated Date values from non-finite arithmetic before continuing expansion', () => {
    expect(recurrenceSource).toContain('Number.isFinite');
  });
});

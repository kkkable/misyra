import { describe, expect, it } from 'vitest';

import { externalCalendarConnections } from './schema.js';

describe('MTS-075 calendar recovery schema contract', () => {
  it('models the provider command cutoff used to discard disconnected-period work', () => {
    expect(Object.hasOwn(externalCalendarConnections, 'providerCommandCutoffAt')).toBe(true);
  });
});

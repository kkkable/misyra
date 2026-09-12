import { describe, expect, it, vi } from 'vitest';

import { createCompletionSettlementChannel } from './completion-settlement-runtime.js';

const settlement = Object.freeze({
  mutationId: '11111111-1111-4111-8111-111111111111',
  occurrenceId: '22222222-2222-4222-8222-222222222222',
  status: 'completed',
  awardedXp: 115,
  totalXp: 230,
});

describe('MTS-061 completion settlement runtime', () => {
  it('retains an exact settlement for one-shot foreground consumption without replaying it to late listeners', () => {
    const channel = createCompletionSettlementChannel();

    channel.publish(settlement);
    const lateListener = vi.fn();
    channel.subscribe(lateListener);

    expect(lateListener).not.toHaveBeenCalled();
    expect(channel.consume(settlement.mutationId)).toEqual(settlement);
    expect(channel.consume(settlement.mutationId)).toBeNull();
  });
});

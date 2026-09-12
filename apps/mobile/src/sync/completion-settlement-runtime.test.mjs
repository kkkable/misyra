import { describe, expect, it, vi } from 'vitest';

import {
  COMPLETION_SETTLEMENT_RETENTION_LIMIT,
  createCompletionSettlementChannel,
} from './completion-settlement-runtime.js';

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

  it('bounds unconsumed transient settlements to the newest entries', () => {
    const channel = createCompletionSettlementChannel();
    const settlements = Array.from(
      { length: COMPLETION_SETTLEMENT_RETENTION_LIMIT + 1 },
      (_, index) => ({
        mutationId: `mutation-${index}`,
        occurrenceId: `occurrence-${index}`,
        status: 'already_completed',
      }),
    );

    for (const item of settlements) channel.publish(item);

    expect(channel.consume(settlements[0].mutationId)).toBeNull();
    expect(channel.consume(settlements.at(-1).mutationId)).toEqual(settlements.at(-1));
  });
});

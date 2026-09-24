import { describe, expect, it, vi } from 'vitest';

import { createStoryConflictSettlementChannel } from './story-conflict-settlement-runtime.js';

describe('MTS-096 Story conflict settlement channel', () => {
  it('publishes only while a Story conflict listener is subscribed', () => {
    const channel = createStoryConflictSettlementChannel();
    const listener = vi.fn();
    const settlement = {
      storyDraftId: '11111111-1111-4111-8111-111111111111',
      occurrenceId: '22222222-2222-4222-8222-222222222222',
    };
    const unsubscribe = channel.subscribe(listener);

    channel.publish(settlement);
    expect(listener).toHaveBeenCalledWith(settlement);

    unsubscribe();
    channel.publish(settlement);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

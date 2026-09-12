import { describe, expect, it, vi } from 'vitest';

import { createCompletionSettlementChannel } from '../sync/completion-settlement-runtime.js';
import { createCompletionConfirmationChannel } from './completion-confirmation-runtime.js';
import { settleForegroundCompletionRequest } from './completion-confirmation-settlement.js';

const request = Object.freeze({
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  mutationId: '22222222-2222-4222-8222-222222222222',
});

function harness() {
  const settlements = createCompletionSettlementChannel();
  const confirmations = createCompletionConfirmationChannel();
  const listener = vi.fn();
  confirmations.subscribe(listener);
  return { settlements, confirmations, listener };
}

describe('MTS-061 authoritative foreground settlement', () => {
  it('uses a retained exact settlement when periodic sync wins the race before the foreground listener', async () => {
    const { settlements, confirmations, listener } = harness();
    const runSync = vi.fn(() => Promise.resolve());
    settlements.publish({
      mutationId: request.mutationId,
      occurrenceId: request.occurrenceId,
      status: 'completed',
      awardedXp: 86,
      totalXp: 250,
    });

    await settleForegroundCompletionRequest({
      request,
      runSync,
      consumeSettlement: (mutationId) => settlements.consume(mutationId),
      subscribeSettlement: (subscriber) => settlements.subscribe(subscriber),
      publishConfirmation: (event) => confirmations.publish(event),
    });

    expect(runSync).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      occurrenceId: request.occurrenceId,
      awardedXp: 86,
      totalXp: 250,
    });
  });

  it('uses the exact accepted transaction total even when another completion settles later', async () => {
    const { settlements, confirmations, listener } = harness();

    await settleForegroundCompletionRequest({
      request,
      runSync: async () => {
        settlements.publish({
          mutationId: request.mutationId,
          occurrenceId: request.occurrenceId,
          status: 'completed',
          awardedXp: 86,
          totalXp: 250,
        });
        settlements.publish({
          mutationId: '33333333-3333-4333-8333-333333333333',
          occurrenceId: '44444444-4444-4444-8444-444444444444',
          status: 'completed',
          awardedXp: 100,
          totalXp: 350,
        });
      },
      subscribeSettlement: (subscriber) => settlements.subscribe(subscriber),
      publishConfirmation: (event) => confirmations.publish(event),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      occurrenceId: request.occurrenceId,
      awardedXp: 86,
      totalXp: 250,
    });
  });

  it('does not animate when another device already completed the mission', async () => {
    const { settlements, confirmations, listener } = harness();

    await settleForegroundCompletionRequest({
      request,
      runSync: async () => {
        settlements.publish({
          mutationId: request.mutationId,
          occurrenceId: request.occurrenceId,
          status: 'already_completed',
        });
      },
      subscribeSettlement: (subscriber) => settlements.subscribe(subscriber),
      publishConfirmation: (event) => confirmations.publish(event),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('still confirms an accepted completion when the later pull phase fails', async () => {
    const { settlements, confirmations, listener } = harness();

    await settleForegroundCompletionRequest({
      request,
      runSync: async () => {
        settlements.publish({
          mutationId: request.mutationId,
          occurrenceId: request.occurrenceId,
          status: 'completed',
          awardedXp: 86,
          totalXp: 250,
        });
        throw new Error('pull_failed_after_completion');
      },
      subscribeSettlement: (subscriber) => settlements.subscribe(subscriber),
      publishConfirmation: (event) => confirmations.publish(event),
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

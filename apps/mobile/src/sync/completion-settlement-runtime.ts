import type {
  CompletionMutationSettlement,
  CompletionSettlementListener,
} from './authenticated-sync-api.js';

export function createCompletionSettlementChannel() {
  const listeners = new Set<CompletionSettlementListener>();

  return Object.freeze({
    publish(settlement: CompletionMutationSettlement): void {
      for (const listener of [...listeners]) listener(settlement);
    },
    subscribe(listener: CompletionSettlementListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const completionSettlementChannel = createCompletionSettlementChannel();

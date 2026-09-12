import type {
  CompletionMutationSettlement,
  CompletionSettlementListener,
} from './authenticated-sync-api.js';

export const COMPLETION_SETTLEMENT_RETENTION_LIMIT = 64;

export function createCompletionSettlementChannel() {
  const listeners = new Set<CompletionSettlementListener>();
  const retained = new Map<string, CompletionMutationSettlement>();

  return Object.freeze({
    publish(settlement: CompletionMutationSettlement): void {
      retained.delete(settlement.mutationId);
      retained.set(settlement.mutationId, settlement);
      while (retained.size > COMPLETION_SETTLEMENT_RETENTION_LIMIT) {
        const oldestMutationId = retained.keys().next().value;
        if (oldestMutationId === undefined) break;
        retained.delete(oldestMutationId);
      }
      for (const listener of [...listeners]) listener(settlement);
    },
    consume(mutationId: string): CompletionMutationSettlement | null {
      const settlement = retained.get(mutationId) ?? null;
      if (settlement !== null) retained.delete(mutationId);
      return settlement;
    },
    subscribe(listener: CompletionSettlementListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const completionSettlementChannel = createCompletionSettlementChannel();

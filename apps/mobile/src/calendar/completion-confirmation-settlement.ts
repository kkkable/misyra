import type {
  CompletionMutationSettlement,
  CompletionSettlementListener,
} from '../sync/authenticated-sync-api.js';
import type {
  ForegroundCompletionConfirmationEvent,
  ForegroundCompletionRequest,
} from './completion-confirmation-runtime.js';

type SettlementSubscription = (listener: CompletionSettlementListener) => () => void;

export async function settleForegroundCompletionRequest(
  input: Readonly<{
    request: ForegroundCompletionRequest;
    runSync: () => Promise<unknown>;
    subscribeSettlement: SettlementSubscription;
    publishConfirmation: (event: ForegroundCompletionConfirmationEvent) => void;
  }>,
): Promise<void> {
  let exactSettlement: CompletionMutationSettlement | null = null;
  const unsubscribe = input.subscribeSettlement((settlement) => {
    if (
      exactSettlement === null &&
      settlement.mutationId === input.request.mutationId &&
      settlement.occurrenceId === input.request.occurrenceId
    ) {
      exactSettlement = settlement;
    }
  });

  let syncFailed = false;
  let syncFailure: unknown;
  try {
    await input.runSync();
  } catch (error) {
    syncFailed = true;
    syncFailure = error;
  } finally {
    unsubscribe();
  }

  if (exactSettlement !== null) {
    if (exactSettlement.status === 'completed') {
      input.publishConfirmation({
        occurrenceId: exactSettlement.occurrenceId,
        awardedXp: exactSettlement.awardedXp,
        totalXp: exactSettlement.totalXp,
      });
    }
    return;
  }

  if (syncFailed) throw syncFailure;
}

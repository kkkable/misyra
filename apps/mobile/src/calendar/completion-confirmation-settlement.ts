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
  const matchingSettlements: CompletionMutationSettlement[] = [];
  const unsubscribe = input.subscribeSettlement((settlement) => {
    if (
      settlement.mutationId === input.request.mutationId &&
      settlement.occurrenceId === input.request.occurrenceId
    ) {
      matchingSettlements.push(settlement);
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

  const exactSettlement = matchingSettlements[0];
  if (exactSettlement !== undefined) {
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

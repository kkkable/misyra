import type {
  CompletionMutationSettlement,
  CompletionSettlementListener,
} from '../sync/authenticated-sync-api.js';
import type {
  ForegroundCompletionConfirmationEvent,
  ForegroundCompletionRequest,
} from './completion-confirmation-runtime.js';

type SettlementConsumer = (mutationId: string) => CompletionMutationSettlement | null;
type SettlementSubscription = (listener: CompletionSettlementListener) => () => void;

function matchesRequest(
  settlement: CompletionMutationSettlement,
  request: ForegroundCompletionRequest,
): boolean {
  return (
    settlement.mutationId === request.mutationId && settlement.occurrenceId === request.occurrenceId
  );
}

function publishCompletedSettlement(
  settlement: CompletionMutationSettlement,
  publishConfirmation: (event: ForegroundCompletionConfirmationEvent) => void,
): void {
  if (settlement.status !== 'completed') return;
  publishConfirmation({
    occurrenceId: settlement.occurrenceId,
    awardedXp: settlement.awardedXp,
    totalXp: settlement.totalXp,
  });
}

export async function settleForegroundCompletionRequest(
  input: Readonly<{
    request: ForegroundCompletionRequest;
    runSync: () => Promise<unknown>;
    consumeSettlement: SettlementConsumer;
    subscribeSettlement: SettlementSubscription;
    publishConfirmation: (event: ForegroundCompletionConfirmationEvent) => void;
  }>,
): Promise<void> {
  const retainedBeforeSync = input.consumeSettlement(input.request.mutationId);
  if (retainedBeforeSync !== null && matchesRequest(retainedBeforeSync, input.request)) {
    publishCompletedSettlement(retainedBeforeSync, input.publishConfirmation);
    return;
  }

  const matchingSettlements: CompletionMutationSettlement[] = [];
  const unsubscribe = input.subscribeSettlement((settlement) => {
    if (matchesRequest(settlement, input.request)) matchingSettlements.push(settlement);
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

  const retainedAfterSync = input.consumeSettlement(input.request.mutationId);
  const exactSettlement =
    retainedAfterSync !== null && matchesRequest(retainedAfterSync, input.request)
      ? retainedAfterSync
      : matchingSettlements[0];
  if (exactSettlement !== undefined && exactSettlement !== null) {
    publishCompletedSettlement(exactSettlement, input.publishConfirmation);
    return;
  }

  if (syncFailed) throw syncFailure;
}

import { Temporal } from '@js-temporal/polyfill';

import { resolveEffectiveTimestamp, type ClockValidationResult } from './time-zone-rules.js';

export interface ConflictSave<T> {
  readonly mutationId: string;
  readonly value: T;
  readonly clientTime: string;
  readonly serverReceiptTime: string;
  readonly validationResult: ClockValidationResult;
}

export interface MissionEditConflictInput<T> {
  readonly first: ConflictSave<T>;
  readonly second: ConflictSave<T>;
  readonly tombstoned: boolean;
}

export interface MissionEditConflictResult<T> {
  readonly winnerMutationId: string | null;
  readonly value: T | null;
  readonly reasonCode: 'latest_valid_save' | 'mission_deleted';
}

export interface CompletionConflictInput {
  readonly acceptedCompletionId: string | null;
  readonly candidateCompletionId: string;
}

export interface CompletionConflictResult {
  readonly acceptedCompletionId: string;
  readonly candidateAccepted: boolean;
  readonly reasonCode: 'completion_accepted' | 'already_completed';
}

export interface StorySaveConflictInput<T> {
  readonly local: ConflictSave<T>;
  readonly remote: ConflictSave<T>;
}

export interface StorySaveConflictResult<T> {
  readonly winnerMutationId: string;
  readonly value: T;
  readonly reasonCode: 'latest_valid_save' | 'story_updated';
  readonly clearLocalUndoHistory: boolean;
}

function assertIdentifier(value: string, label: string): void {
  if (value.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
}

function compareInstants(first: string, second: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(first), Temporal.Instant.from(second));
}

function compareIdentifiers(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}

function selectLatestSave<T>(first: ConflictSave<T>, second: ConflictSave<T>): ConflictSave<T> {
  assertIdentifier(first.mutationId, 'First mutation ID');
  assertIdentifier(second.mutationId, 'Second mutation ID');

  const firstTimestamp = resolveEffectiveTimestamp({
    clientTime: first.clientTime,
    serverReceiptTime: first.serverReceiptTime,
    validationResult: first.validationResult,
  });
  const secondTimestamp = resolveEffectiveTimestamp({
    clientTime: second.clientTime,
    serverReceiptTime: second.serverReceiptTime,
    validationResult: second.validationResult,
  });

  const effectiveTimeComparison = compareInstants(
    firstTimestamp.effectiveTime,
    secondTimestamp.effectiveTime,
  );
  if (effectiveTimeComparison !== 0) {
    return effectiveTimeComparison > 0 ? first : second;
  }

  const receiptTimeComparison = compareInstants(
    firstTimestamp.serverReceiptTime,
    secondTimestamp.serverReceiptTime,
  );
  if (receiptTimeComparison !== 0) {
    return receiptTimeComparison > 0 ? first : second;
  }

  return compareIdentifiers(first.mutationId, second.mutationId) >= 0 ? first : second;
}

export function resolveMissionEditConflict<T>(
  input: MissionEditConflictInput<T>,
): MissionEditConflictResult<T> {
  if (input.tombstoned) {
    return Object.freeze({
      winnerMutationId: null,
      value: null,
      reasonCode: 'mission_deleted',
    });
  }

  const winner = selectLatestSave(input.first, input.second);
  return Object.freeze({
    winnerMutationId: winner.mutationId,
    value: winner.value,
    reasonCode: 'latest_valid_save',
  });
}

export function resolveCompletionConflict(
  input: CompletionConflictInput,
): CompletionConflictResult {
  assertIdentifier(input.candidateCompletionId, 'Candidate completion ID');

  if (input.acceptedCompletionId !== null) {
    assertIdentifier(input.acceptedCompletionId, 'Accepted completion ID');
    return Object.freeze({
      acceptedCompletionId: input.acceptedCompletionId,
      candidateAccepted: false,
      reasonCode: 'already_completed',
    });
  }

  return Object.freeze({
    acceptedCompletionId: input.candidateCompletionId,
    candidateAccepted: true,
    reasonCode: 'completion_accepted',
  });
}

export function resolveStorySaveConflict<T>(
  input: StorySaveConflictInput<T>,
): StorySaveConflictResult<T> {
  const winner = selectLatestSave(input.local, input.remote);
  const remoteWon = winner === input.remote;

  return Object.freeze({
    winnerMutationId: winner.mutationId,
    value: winner.value,
    reasonCode: remoteWon ? 'story_updated' : 'latest_valid_save',
    clearLocalUndoHistory: remoteWon,
  });
}

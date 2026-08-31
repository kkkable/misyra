import { Temporal } from '@js-temporal/polyfill';

export type StreakCompletionType =
  'verified_on_time' | 'verified_late' | 'self_confirmed' | 'private' | 'trust_mode';

export type StreakDayState = 'paused' | 'continued' | 'broken' | 'pending';

export interface StreakDayRecord {
  readonly localDate: string;
  readonly state: StreakDayState;
  readonly finalized: boolean;
}

export interface StreakEvaluationInput {
  readonly scheduledMissionCount: number;
  readonly completionTypes: readonly StreakCompletionType[];
  readonly pendingEvidenceCount: number;
}

export interface FinalizeStreakDayInput extends StreakEvaluationInput {
  readonly record: StreakDayRecord;
  readonly now: string;
  readonly currentTimeZone: string;
}

export type PendingStreakResolution = 'accepted' | 'self_confirmed' | 'rejected';

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function assertLocalDate(localDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new TypeError('Streak local date must use YYYY-MM-DD format.');
  }

  const [yearText, monthText, dayText] = localDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError('Streak local date must be a real calendar date.');
  }
}

function assertCompletionTypes(completionTypes: readonly string[]): void {
  for (const completionType of completionTypes) {
    if (
      completionType !== 'verified_on_time' &&
      completionType !== 'verified_late' &&
      completionType !== 'self_confirmed' &&
      completionType !== 'private' &&
      completionType !== 'trust_mode'
    ) {
      throw new TypeError('Invalid streak completion type.');
    }
  }
}

function assertTimeZone(timeZone: string): void {
  const firstCharacter = timeZone.at(0);
  if (firstCharacter === '+' || firstCharacter === '-' || firstCharacter === '−') {
    throw new TypeError(`Invalid IANA time zone: ${timeZone}.`);
  }

  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
  } catch {
    throw new TypeError(`Invalid IANA time zone: ${timeZone}.`);
  }
}

function parseInstant(value: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new TypeError('Current streak instant must be a valid absolute timestamp.');
  }
}

function currentLocalDate(now: string, currentTimeZone: string): string {
  assertTimeZone(currentTimeZone);
  return parseInstant(now).toZonedDateTimeISO(currentTimeZone).toPlainDate().toString();
}

export function evaluateStreakDay(input: StreakEvaluationInput): StreakDayState {
  assertNonNegativeInteger(input.scheduledMissionCount, 'Scheduled mission count');
  assertNonNegativeInteger(input.pendingEvidenceCount, 'Pending evidence count');
  assertCompletionTypes(input.completionTypes);

  if (input.scheduledMissionCount === 0) {
    return 'paused';
  }
  if (input.completionTypes.length > 0) {
    return 'continued';
  }
  if (input.pendingEvidenceCount > 0) {
    return 'pending';
  }
  return 'broken';
}

export function finalizeStreakDay(input: FinalizeStreakDayInput): StreakDayRecord {
  if (input.record.finalized) {
    return input.record;
  }

  assertLocalDate(input.record.localDate);
  const appLocalDate = currentLocalDate(input.now, input.currentTimeZone);
  const state = evaluateStreakDay(input);

  if (input.record.localDate >= appLocalDate || state === 'pending') {
    return Object.freeze({
      localDate: input.record.localDate,
      state,
      finalized: false,
    });
  }

  return Object.freeze({
    localDate: input.record.localDate,
    state,
    finalized: true,
  });
}

export function resolvePendingStreakDay(
  record: StreakDayRecord,
  resolution: PendingStreakResolution,
  now: string,
  currentTimeZone: string,
): StreakDayRecord {
  if (record.finalized) {
    return record;
  }
  if (record.state !== 'pending') {
    throw new TypeError('Only a pending streak day can resolve pending evidence.');
  }

  assertLocalDate(record.localDate);
  const appLocalDate = currentLocalDate(now, currentTimeZone);
  const finalized = record.localDate < appLocalDate;

  switch (resolution) {
    case 'accepted':
    case 'self_confirmed':
      return Object.freeze({
        localDate: record.localDate,
        state: 'continued',
        finalized,
      });
    case 'rejected':
      return Object.freeze({
        localDate: record.localDate,
        state: 'broken',
        finalized,
      });
    default:
      throw new TypeError('Invalid pending streak resolution.');
  }
}

export type StreakCompletionType =
  | 'verified_on_time'
  | 'verified_late'
  | 'self_confirmed'
  | 'private'
  | 'trust_mode';

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

function currentLocalDate(now: string, currentTimeZone: string): string {
  const instant = new Date(now);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Current streak instant must be a valid ISO timestamp.');
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: currentTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError('Could not resolve the current local streak day.');
  }

  return `${year}-${month}-${day}`;
}

export function evaluateStreakDay(input: StreakEvaluationInput): StreakDayState {
  assertNonNegativeInteger(input.scheduledMissionCount, 'Scheduled mission count');
  assertNonNegativeInteger(input.pendingEvidenceCount, 'Pending evidence count');

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
): StreakDayRecord {
  if (record.finalized) {
    return record;
  }
  if (record.state !== 'pending') {
    throw new TypeError('Only a pending streak day can resolve pending evidence.');
  }

  switch (resolution) {
    case 'accepted':
    case 'self_confirmed':
      return Object.freeze({
        localDate: record.localDate,
        state: 'continued',
        finalized: true,
      });
    case 'rejected':
      return Object.freeze({
        localDate: record.localDate,
        state: 'broken',
        finalized: true,
      });
  }
}

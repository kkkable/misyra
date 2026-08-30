import type { MissionOccurrence, MissionSeries } from './mission-model.js';

export type RecurringSeriesScope = 'this_occurrence' | 'this_and_future' | 'entire_series';
export type RecurringScopeOperation = 'edit' | 'delete';

export interface RecurringSeriesScopeInput {
  readonly series: MissionSeries;
  readonly occurrences: readonly MissionOccurrence[];
  readonly selectedOccurrenceId: string;
  readonly scope: RecurringSeriesScope;
  readonly operation: RecurringScopeOperation;
}

export interface RecurringSeriesSplitBoundary {
  readonly occurrenceId: string;
  readonly localStart: string;
  readonly startInstant: string;
}

export interface RecurringSeriesScopePlan {
  readonly affectedOccurrenceIds: readonly string[];
  readonly preservedOccurrenceIds: readonly string[];
  readonly retiredOccurrenceIds: readonly string[];
  readonly splitBoundary: RecurringSeriesSplitBoundary | null;
}

const SCOPES = ['this_occurrence', 'this_and_future', 'entire_series'] as const;
const OPERATIONS = ['edit', 'delete'] as const;

function assertAllowedValue(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value)) {
    throw new TypeError(`Invalid ${label}: ${value}.`);
  }
}

function occurrenceTime(occurrence: MissionOccurrence): number {
  const time = Date.parse(occurrence.schedule.startInstant);
  if (!Number.isFinite(time)) {
    throw new TypeError(`Occurrence ${occurrence.id} must have a valid start instant.`);
  }
  return time;
}

function compareOccurrences(left: MissionOccurrence, right: MissionOccurrence): number {
  const timeDifference = occurrenceTime(left) - occurrenceTime(right);
  if (timeDifference !== 0) {
    return timeDifference;
  }
  return left.id.localeCompare(right.id);
}

function freezeIds(occurrences: readonly MissionOccurrence[]): readonly string[] {
  return Object.freeze(occurrences.map((occurrence) => occurrence.id));
}

export function planRecurringSeriesScope(
  input: RecurringSeriesScopeInput,
): RecurringSeriesScopePlan {
  if (input.series.recurrence === null) {
    throw new TypeError('Recurring scope operations require a recurring series.');
  }

  assertAllowedValue(input.scope, SCOPES, 'recurring-series scope');
  assertAllowedValue(input.operation, OPERATIONS, 'recurring-series operation');

  const occurrenceIds = new Set<string>();
  for (const occurrence of input.occurrences) {
    if (occurrence.seriesId !== input.series.id) {
      throw new TypeError(`Occurrence ${occurrence.id} does not belong to the requested series.`);
    }
    if (occurrenceIds.has(occurrence.id)) {
      throw new TypeError(`Duplicate occurrence id: ${occurrence.id}.`);
    }
    occurrenceIds.add(occurrence.id);
  }

  const ordered = [...input.occurrences].sort(compareOccurrences);
  const selectedIndex = ordered.findIndex(
    (occurrence) => occurrence.id === input.selectedOccurrenceId,
  );
  if (selectedIndex < 0) {
    throw new TypeError('Selected occurrence must exist in the recurring series.');
  }
  const selected = ordered[selectedIndex];
  if (selected === undefined) {
    throw new TypeError('Selected occurrence must exist in the recurring series.');
  }

  let scoped: readonly MissionOccurrence[];
  switch (input.scope) {
    case 'this_occurrence':
      scoped = [selected];
      break;
    case 'this_and_future':
      scoped = ordered.slice(selectedIndex);
      break;
    case 'entire_series':
      scoped = ordered;
      break;
  }

  // Completed history and existing tombstones are immutable under series-scope edits/deletes.
  const affected = scoped.filter(
    (occurrence) =>
      occurrence.completionState !== 'completed' && occurrence.deletionState !== 'deleted',
  );
  const affectedIds = freezeIds(affected);
  const affectedSet = new Set(affectedIds);
  const preserved = ordered.filter((occurrence) => !affectedSet.has(occurrence.id));

  // Carry existing tombstones forward; delete operations add only the applicable unfinished ids.
  const alreadyRetiredIds = ordered
    .filter((occurrence) => occurrence.deletionState === 'deleted')
    .map((occurrence) => occurrence.id);
  const retiredIds =
    input.operation === 'delete'
      ? [...new Set([...alreadyRetiredIds, ...affectedIds])]
      : alreadyRetiredIds;

  const splitBoundary =
    input.scope === 'this_and_future'
      ? Object.freeze({
          occurrenceId: selected.id,
          localStart: selected.schedule.localStart,
          startInstant: selected.schedule.startInstant,
        })
      : null;

  return Object.freeze({
    affectedOccurrenceIds: affectedIds,
    preservedOccurrenceIds: freezeIds(preserved),
    retiredOccurrenceIds: Object.freeze(retiredIds),
    splitBoundary,
  });
}

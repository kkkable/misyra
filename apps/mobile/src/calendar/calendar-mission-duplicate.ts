import { createMissionOccurrence, type MissionOccurrenceInput } from '@misyra/domain';

import type { MutationQueueDatabase } from '../storage/mutation-queue.js';
import type { CalendarMissionCreateInput } from './calendar-mission-create.js';

type PrepareCalendarMissionDuplicateOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  occurrenceId: string;
  now: Date;
}>;

type DuplicateSourceRow = Readonly<{
  title: string;
  payload_json: string;
  location: string | null;
  search_note: string | null;
  personal_note: string | null;
}>;

const COMPLETION_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}$/;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

function minuteFromLocalDateTime(value: string): number {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null) throw new Error('Mission local time is invalid.');
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error('Mission local time is invalid.');
  }
  return hour * 60 + minute;
}

function localDateFromDateTime(value: string): string {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null || match[1] === undefined) throw new Error('Mission local date is invalid.');
  return match[1];
}

function datePart(parts: readonly Intl.DateTimeFormatPart[], type: string): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) throw new Error(`Mission time zone formatting omitted ${type}.`);
  return value;
}

function localDateForInstant(instant: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
  } catch {
    throw new Error('Mission time zone is invalid.');
  }
  return `${datePart(parts, 'year')}-${datePart(parts, 'month')}-${datePart(parts, 'day')}`;
}

function isExpired(finishInstant: string, now: Date): boolean {
  const finish = Date.parse(finishInstant);
  if (!Number.isFinite(finish)) throw new Error('Mission finish instant is invalid.');
  return now.getTime() >= finish + COMPLETION_WINDOW_MILLISECONDS;
}

export async function prepareCalendarMissionDuplicate({
  database,
  accountId,
  occurrenceId,
  now,
}: PrepareCalendarMissionDuplicateOptions): Promise<CalendarMissionCreateInput> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(occurrenceId, 'Occurrence ID');

  const source = await database.getFirstAsync<DuplicateSourceRow>(
    `SELECT
       s.title,
       o.payload_json,
       (SELECT d.location
          FROM search_documents d
         WHERE d.account_id = o.account_id AND d.occurrence_id = o.occurrence_id
         ORDER BY d.document_id
         LIMIT 1) AS location,
       (SELECT d.personal_note
          FROM search_documents d
         WHERE d.account_id = o.account_id AND d.occurrence_id = o.occurrence_id
         ORDER BY d.document_id
         LIMIT 1) AS search_note,
       (SELECT p.note
          FROM personal_notes p
         WHERE p.account_id = o.account_id AND p.occurrence_id = o.occurrence_id
         LIMIT 1) AS personal_note
     FROM cached_mission_occurrences o
     JOIN cached_mission_series s
       ON s.account_id = o.account_id AND s.series_id = o.series_id
    WHERE o.account_id = ? AND o.occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  if (source === null) throw new Error('Mission duplication source was not found.');

  const occurrence = createMissionOccurrence(
    JSON.parse(source.payload_json) as MissionOccurrenceInput,
  );
  const schedule = occurrence.schedule;
  const historicalDefault =
    occurrence.scheduleState === 'cancelled' ||
    (occurrence.completionState === 'incomplete' && isExpired(schedule.finishInstant, now));
  const selectedDate = historicalDefault
    ? localDateForInstant(now, schedule.timeZone)
    : localDateFromDateTime(schedule.localStart);
  const notes =
    occurrence.fieldOwnership === 'organizer_controlled'
      ? (source.personal_note ?? source.search_note)
      : (source.search_note ?? source.personal_note);

  return {
    selectedDate,
    title: source.title,
    allDay: schedule.allDay,
    startMinute: schedule.allDay ? null : minuteFromLocalDateTime(schedule.localStart),
    endMinute: schedule.allDay ? null : minuteFromLocalDateTime(schedule.localFinish),
    estimatedEffortMinutes: schedule.allDay ? schedule.estimatedEffortMinutes : null,
    rewardEligibility: 'eligible',
    timeZone: schedule.timeZone,
    timeBehavior: schedule.timeBehavior,
    private: occurrence.evidenceState === 'not_required',
    location: source.location,
    notes,
  };
}

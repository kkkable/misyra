import {
  createMissionOccurrence,
  createMissionSeries,
  planRecurringSeriesScope,
  type MissionOccurrenceInput,
  type MissionSeriesInput,
  type RecurringSeriesScope,
} from '@misyra/domain';

import {
  createMutationQueue,
  publishLocalMutationApplied,
  type MutationQueueDatabase,
} from '../storage/mutation-queue.js';

type CalendarMissionDeletionEntry = Readonly<{
  occurrenceId: string;
  mutationId: string;
  originalPayloadJson: string;
  originalUpdatedAt: string;
  notifications: readonly Readonly<{
    notificationId: string;
    scheduledAt: string;
    updatedAt: string;
  }>[];
}>;

export type CalendarMissionDeletion = CalendarMissionDeletionEntry &
  Readonly<{
    scopedDeletions?: readonly CalendarMissionDeletionEntry[] | undefined;
  }>;

type DeleteCalendarMissionOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  occurrenceId: string;
  scope?: RecurringSeriesScope | undefined;
  now: Date;
  generateId: () => string;
}>;

type CachedOccurrenceRow = Readonly<{
  occurrence_id: string;
  payload_json: string;
  server_version: number | null;
  updated_at: string;
}>;

type CachedMissionRow = CachedOccurrenceRow &
  Readonly<{
    series_payload_json: string;
  }>;

type NotificationRow = Readonly<{
  notification_id: string;
  scheduled_at: string;
  updated_at: string;
}>;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

function resolveDeleteBaseVersion(
  serverVersion: number | null,
  synchronizationState: string,
): number {
  if (serverVersion === null) {
    if (synchronizationState === 'pending') return 1;
    throw new Error('Mission deletion requires an authoritative or pending-create version.');
  }
  if (!Number.isSafeInteger(serverVersion) || serverVersion <= 0) {
    throw new Error('Mission deletion requires a positive server version.');
  }
  return serverVersion;
}

async function deleteSingleCalendarMission({
  database,
  accountId,
  deviceId,
  occurrenceId,
  now,
  generateId,
}: Omit<DeleteCalendarMissionOptions, 'scope'>): Promise<CalendarMissionDeletionEntry> {
  const cached = await database.getFirstAsync<CachedOccurrenceRow>(
    `SELECT occurrence_id, payload_json, server_version, updated_at
       FROM cached_mission_occurrences
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  if (cached === null) throw new Error('Mission deletion target was not found.');

  const occurrence = createMissionOccurrence(
    JSON.parse(cached.payload_json) as MissionOccurrenceInput,
  );
  if (occurrence.deletionState !== 'active') {
    throw new Error('Mission deletion target is already deleted.');
  }
  const baseVersion = resolveDeleteBaseVersion(
    cached.server_version,
    occurrence.synchronizationState,
  );
  const notificationRows = await database.getAllAsync<NotificationRow>(
    `SELECT notification_id, scheduled_at, updated_at
       FROM notification_registry
      WHERE account_id = ? AND occurrence_id = ?
      ORDER BY notification_id`,
    accountId,
    occurrenceId,
  );
  const notifications = notificationRows.map((row) => ({
    notificationId: row.notification_id,
    scheduledAt: row.scheduled_at,
    updatedAt: row.updated_at,
  }));
  const occurredAt = now.toISOString();
  const mutationId = generateId();
  assertNonEmpty(mutationId, 'Mutation ID');
  const deletedOccurrence = createMissionOccurrence({
    ...occurrence,
    synchronizationState: 'pending',
    deletionState: 'deleted',
  });
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId,
      accountId,
      deviceId,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'delete',
      baseVersion,
      clientOccurredAt: occurredAt,
      payload: null,
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      const latest = await transaction.getFirstAsync<CachedOccurrenceRow>(
        `SELECT occurrence_id, payload_json, server_version, updated_at
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (
        latest === null ||
        latest.payload_json !== cached.payload_json ||
        latest.server_version !== cached.server_version ||
        latest.updated_at !== cached.updated_at
      ) {
        throw new Error('Mission deletion target changed before save.');
      }

      await transaction.runAsync(
        `INSERT INTO mission_occurrence_tombstones
          (account_id, occurrence_id, deleted_at, reason)
         VALUES (?, ?, ?, 'user_deleted')
         ON CONFLICT(account_id, occurrence_id) DO NOTHING`,
        accountId,
        occurrenceId,
        occurredAt,
      );
      await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET payload_json = ?, updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        JSON.stringify(deletedOccurrence),
        occurredAt,
        accountId,
        occurrenceId,
      );
    },
  });

  return {
    occurrenceId,
    mutationId,
    originalPayloadJson: cached.payload_json,
    originalUpdatedAt: cached.updated_at,
    notifications,
  };
}

export async function deleteCalendarMission({
  database,
  accountId,
  deviceId,
  occurrenceId,
  scope,
  now,
  generateId,
}: DeleteCalendarMissionOptions): Promise<CalendarMissionDeletion> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(occurrenceId, 'Occurrence ID');

  const selected = await database.getFirstAsync<CachedMissionRow>(
    `SELECT o.occurrence_id, o.payload_json, o.server_version, o.updated_at,
            s.payload_json AS series_payload_json
       FROM cached_mission_occurrences o
       JOIN cached_mission_series s
         ON s.account_id = o.account_id AND s.series_id = o.series_id
      WHERE o.account_id = ? AND o.occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  if (selected === null) throw new Error('Mission deletion target was not found.');

  const selectedOccurrence = createMissionOccurrence(
    JSON.parse(selected.payload_json) as MissionOccurrenceInput,
  );
  const series = createMissionSeries(
    JSON.parse(selected.series_payload_json) as MissionSeriesInput,
  );
  if (series.recurrence === null) {
    if (scope !== undefined && scope !== 'this_occurrence') {
      throw new Error('Series scope requires a recurring mission.');
    }
    return deleteSingleCalendarMission({
      database,
      accountId,
      deviceId,
      occurrenceId,
      now,
      generateId,
    });
  }
  if (scope === undefined) {
    throw new Error('Recurring mission deletion requires an explicit scope.');
  }

  const cachedOccurrences = await database.getAllAsync<CachedOccurrenceRow>(
    `SELECT occurrence_id, payload_json, server_version, updated_at
       FROM cached_mission_occurrences
      WHERE account_id = ? AND series_id = ?
      ORDER BY occurrence_id`,
    accountId,
    series.id,
  );
  const occurrences = cachedOccurrences.map((row) =>
    createMissionOccurrence(JSON.parse(row.payload_json) as MissionOccurrenceInput),
  );
  const plan = planRecurringSeriesScope({
    series,
    occurrences,
    selectedOccurrenceId: selectedOccurrence.id,
    scope,
    operation: 'delete',
  });
  if (plan.affectedOccurrenceIds.length === 0) {
    throw new Error('Recurring mission scope contains no unfinished occurrence to delete.');
  }

  const deletions: CalendarMissionDeletionEntry[] = [];
  for (const targetOccurrenceId of plan.affectedOccurrenceIds) {
    deletions.push(
      await deleteSingleCalendarMission({
        database,
        accountId,
        deviceId,
        occurrenceId: targetOccurrenceId,
        now,
        generateId,
      }),
    );
  }
  const primary =
    deletions.find((deletion) => deletion.occurrenceId === occurrenceId) ?? deletions[0];
  if (primary === undefined) throw new Error('Recurring mission deletion produced no operation.');
  return { ...primary, scopedDeletions: Object.freeze(deletions) };
}

export async function undoCalendarMissionDeletion({
  database,
  accountId,
  deletion,
}: Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deletion: CalendarMissionDeletion;
}>): Promise<boolean> {
  assertNonEmpty(accountId, 'Account ID');
  const deletions = deletion.scopedDeletions ?? [deletion];
  const commitState = { restored: false };

  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const item of deletions) {
      const queued = await transaction.getFirstAsync<{ command_json: string }>(
        `SELECT command_json
           FROM mutation_queue
          WHERE account_id = ? AND mutation_id = ?`,
        accountId,
        item.mutationId,
      );
      if (queued === null) return;
      const envelope = JSON.parse(queued.command_json) as {
        inFlight?: unknown;
        mutation?: { entityId?: unknown; operation?: unknown };
      };
      if (envelope.inFlight === true || envelope.inFlight === 1) return;
      if (
        envelope.mutation?.entityId !== item.occurrenceId ||
        envelope.mutation.operation !== 'delete'
      ) {
        return;
      }
      const tombstone = await transaction.getFirstAsync<{ occurrence_id: string }>(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        item.occurrenceId,
      );
      const cached = await transaction.getFirstAsync<{ occurrence_id: string }>(
        `SELECT occurrence_id
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        item.occurrenceId,
      );
      if (tombstone === null || cached === null) return;
    }

    for (const item of deletions) {
      await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET payload_json = ?, updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        item.originalPayloadJson,
        item.originalUpdatedAt,
        accountId,
        item.occurrenceId,
      );
      await transaction.runAsync(
        'DELETE FROM mission_occurrence_tombstones WHERE account_id = ? AND occurrence_id = ?',
        accountId,
        item.occurrenceId,
      );
      await transaction.runAsync(
        'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
        accountId,
        item.mutationId,
      );
    }
    commitState.restored = true;
  });

  if (commitState.restored) publishLocalMutationApplied({ entityType: 'mission' });
  return commitState.restored;
}

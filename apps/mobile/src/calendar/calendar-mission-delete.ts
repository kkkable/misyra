import { createMissionOccurrence, type MissionOccurrenceInput } from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

export type CalendarMissionDeletion = Readonly<{
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

type DeleteCalendarMissionOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  occurrenceId: string;
  now: Date;
  generateId: () => string;
}>;

type CachedOccurrenceRow = Readonly<{
  payload_json: string;
  server_version: number | null;
  updated_at: string;
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

export async function deleteCalendarMission({
  database,
  accountId,
  deviceId,
  occurrenceId,
  now,
  generateId,
}: DeleteCalendarMissionOptions): Promise<CalendarMissionDeletion> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(occurrenceId, 'Occurrence ID');

  const cached = await database.getFirstAsync<CachedOccurrenceRow>(
    `SELECT payload_json, server_version, updated_at
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
        `SELECT payload_json, server_version, updated_at
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
      await transaction.runAsync(
        'DELETE FROM notification_registry WHERE account_id = ? AND occurrence_id = ?',
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
  let restored = false;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const queued = await transaction.getFirstAsync<{ command_json: string }>(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ? AND mutation_id = ?`,
      accountId,
      deletion.mutationId,
    );
    if (queued === null) return;
    const envelope = JSON.parse(queued.command_json) as {
      inFlight?: unknown;
      mutation?: { entityId?: unknown; operation?: unknown };
    };
    if (envelope.inFlight === true || envelope.inFlight === 1) return;
    if (
      envelope.mutation?.entityId !== deletion.occurrenceId ||
      envelope.mutation.operation !== 'delete'
    ) {
      return;
    }

    const tombstone = await transaction.getFirstAsync<{ occurrence_id: string }>(
      `SELECT occurrence_id
         FROM mission_occurrence_tombstones
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      deletion.occurrenceId,
    );
    const cached = await transaction.getFirstAsync<{ occurrence_id: string }>(
      `SELECT occurrence_id
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      deletion.occurrenceId,
    );
    if (tombstone === null || cached === null) return;

    await transaction.runAsync(
      `UPDATE cached_mission_occurrences
          SET payload_json = ?, updated_at = ?
        WHERE account_id = ? AND occurrence_id = ?`,
      deletion.originalPayloadJson,
      deletion.originalUpdatedAt,
      accountId,
      deletion.occurrenceId,
    );
    await transaction.runAsync(
      'DELETE FROM mission_occurrence_tombstones WHERE account_id = ? AND occurrence_id = ?',
      accountId,
      deletion.occurrenceId,
    );
    for (const notification of deletion.notifications) {
      await transaction.runAsync(
        `INSERT INTO notification_registry
          (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id, notification_id) DO UPDATE SET
           occurrence_id = excluded.occurrence_id,
           scheduled_at = excluded.scheduled_at,
           updated_at = excluded.updated_at`,
        accountId,
        notification.notificationId,
        deletion.occurrenceId,
        notification.scheduledAt,
        notification.updatedAt,
      );
    }
    await transaction.runAsync(
      'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
      accountId,
      deletion.mutationId,
    );
    restored = true;
  });

  return restored;
}

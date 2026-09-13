import { createMissionOccurrence, type MissionOccurrenceInput } from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

type SaveOrganizerPersonalNoteOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  occurrenceId: string;
  note: string;
  now: Date;
  generateId: () => string;
}>;

type CachedOccurrenceRow = Readonly<{
  payload_json: string;
}>;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

export async function saveOrganizerPersonalNote({
  database,
  accountId,
  deviceId,
  occurrenceId,
  note,
  now,
  generateId,
}: SaveOrganizerPersonalNoteOptions): Promise<void> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(occurrenceId, 'Mission occurrence ID');

  const row = await database.getFirstAsync<CachedOccurrenceRow>(
    `SELECT payload_json
       FROM cached_mission_occurrences
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  if (row === null) throw new Error('Mission is not available in the local cache.');

  const occurrence = createMissionOccurrence(
    JSON.parse(row.payload_json) as MissionOccurrenceInput,
  );
  if (
    occurrence.calendarSource !== 'external' ||
    occurrence.fieldOwnership !== 'organizer_controlled' ||
    occurrence.scheduleState !== 'scheduled' ||
    occurrence.completionState !== 'incomplete' ||
    occurrence.deletionState !== 'active'
  ) {
    throw new Error('Personal notes require an active unfinished organizer-controlled mission.');
  }

  const mutationId = generateId();
  assertNonEmpty(mutationId, 'Mutation ID');
  const clientOccurredAt = now.toISOString();
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId,
      accountId,
      deviceId,
      entityType: 'mission_personal_note',
      entityId: occurrenceId,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt,
      payload: { note },
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO personal_notes (account_id, occurrence_id, note, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
           note = excluded.note,
           updated_at = excluded.updated_at`,
        accountId,
        occurrenceId,
        note,
        clientOccurredAt,
      );
      await transaction.runAsync(
        `UPDATE search_documents
            SET personal_note = ?, updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        note,
        clientOccurredAt,
        accountId,
        occurrenceId,
      );
    },
  });
}

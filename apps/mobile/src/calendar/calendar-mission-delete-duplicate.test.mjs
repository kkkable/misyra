import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { deleteCalendarMission, undoCalendarMissionDeletion } from './calendar-mission-delete.js';
import { prepareCalendarMissionDuplicate } from './calendar-mission-duplicate.js';
import { createLocalRepositories } from '../storage/local-repositories.js';
import { applyMobileMigrations } from '../storage/schema.js';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async runAsync(sql, ...params) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
  }

  async getFirstAsync(sql, ...params) {
    return this.database.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const databases = [];

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const deleteMutationId = '55555555-5555-4555-8555-555555555555';

function timedSchedule({
  localStart = '2026-09-08T09:15:00',
  localFinish = '2026-09-08T10:00:00',
  startInstant = '2026-09-08T09:15:00.000Z',
  finishInstant = '2026-09-08T10:00:00.000Z',
} = {}) {
  return {
    localStart,
    localFinish,
    startInstant,
    finishInstant,
    timeZone: 'UTC',
    timeBehavior: 'local_time',
    allDay: false,
    estimatedEffortMinutes: null,
  };
}

function occurrence(overrides = {}) {
  return {
    id: occurrenceId,
    seriesId,
    schedule: timedSchedule(),
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
    ...overrides,
  };
}

async function setupAccount(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'UTC')`,
    accountId,
    '2026-09-08T08:00:00.000Z',
  );
}

async function insertMission(
  database,
  {
    title = 'Keep me tidy',
    missionOccurrence = occurrence(),
    localDate = '2026-09-08',
    scheduledStart = '09:15',
    scheduledEnd = '10:00',
    serverVersion = 4,
    location = 'Tokyo',
    notes = 'Bring notes',
  } = {},
) {
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    title,
    missionOccurrence.schedule.timeZone,
    JSON.stringify({ id: seriesId, title, recurrence: null }),
    '2026-09-08T08:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    localDate,
    scheduledStart,
    scheduledEnd,
    JSON.stringify(missionOccurrence),
    serverVersion,
    '2026-09-08T08:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO search_documents
      (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    accountId,
    occurrenceId,
    occurrenceId,
    title,
    location,
    notes,
    '2026-09-08T08:00:00.000Z',
  );
}

describe('MTS-048 local mission deletion', () => {
  it('tombstones locally and safely undoes while delete is queued', async () => {
    const database = createDatabase();
    await setupAccount(database);
    await insertMission(database);
    await database.runAsync(
      `INSERT INTO notification_registry
        (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      accountId,
      'notification-1',
      occurrenceId,
      '2026-09-08T09:15:00.000Z',
      '2026-09-08T08:00:00.000Z',
    );
    const repositories = createLocalRepositories(database, accountId);

    const deletion = await deleteCalendarMission({
      database,
      accountId,
      deviceId,
      occurrenceId,
      now: new Date('2026-09-08T08:30:00.000Z'),
      generateId: () => deleteMutationId,
    });

    await expect(repositories.missions.getById(occurrenceId)).resolves.toBeNull();
    await expect(
      repositories.calendar.listWindow({
        startLocalDate: '2026-09-08',
        endLocalDate: '2026-09-08',
      }),
    ).resolves.toEqual([]);
    expect(
      await database.getFirstAsync(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ occurrence_id: occurrenceId });
    expect(
      await database.getFirstAsync(
        `SELECT notification_id
           FROM notification_registry
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toBeNull();

    const queued = await database.getFirstAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ? AND mutation_id = ?`,
      accountId,
      deleteMutationId,
    );
    expect(JSON.parse(queued.command_json).mutation).toMatchObject({
      mutationId: deleteMutationId,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'delete',
      baseVersion: 4,
      payload: null,
    });

    await expect(undoCalendarMissionDeletion({ database, accountId, deletion })).resolves.toBe(true);
    await expect(repositories.missions.getById(occurrenceId)).resolves.not.toBeNull();
    expect(
      await database.getFirstAsync(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toBeNull();
    expect(
      await database.getFirstAsync(
        `SELECT notification_id
           FROM notification_registry
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ notification_id: 'notification-1' });
    expect(
      await database.getFirstAsync(
        `SELECT mutation_id
           FROM mutation_queue
          WHERE account_id = ? AND mutation_id = ?`,
        accountId,
        deleteMutationId,
      ),
    ).toBeNull();
  });

  it('does not revive after the delete settles', async () => {
    const database = createDatabase();
    await setupAccount(database);
    await insertMission(database);

    const deletion = await deleteCalendarMission({
      database,
      accountId,
      deviceId,
      occurrenceId,
      now: new Date('2026-09-08T08:30:00.000Z'),
      generateId: () => deleteMutationId,
    });
    await database.runAsync(
      'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
      accountId,
      deleteMutationId,
    );

    await expect(undoCalendarMissionDeletion({ database, accountId, deletion })).resolves.toBe(false);
    expect(
      await database.getFirstAsync(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ occurrence_id: occurrenceId });
  });
});

describe('MTS-048 mission duplication draft', () => {
  it('builds an expired imported duplicate as a state-free draft only', async () => {
    const database = createDatabase();
    await setupAccount(database);
    const expiredOccurrence = occurrence({
      schedule: timedSchedule({
        localStart: '2026-07-01T09:15:00',
        localFinish: '2026-07-01T10:00:00',
        startInstant: '2026-07-01T09:15:00.000Z',
        finishInstant: '2026-07-01T10:00:00.000Z',
      }),
      completionState: 'incomplete',
      evidenceState: 'not_required',
      rewardEligibility: 'ineligible',
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      storyState: 'ready',
    });
    await insertMission(database, {
      title: 'Imported appointment',
      missionOccurrence: expiredOccurrence,
      localDate: '2026-07-01',
      scheduledStart: '09:15',
      scheduledEnd: '10:00',
      location: 'Kowloon',
      notes: null,
    });
    await database.runAsync(
      `INSERT INTO personal_notes (account_id, occurrence_id, note, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      'My private note',
      '2026-09-08T08:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO external_links
        (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
       VALUES (?, ?, 'google', ?, ?, ?)`,
      accountId,
      occurrenceId,
      'provider-event-123',
      JSON.stringify({ attendeeState: 'accepted', organizer: 'someone@example.com' }),
      '2026-09-08T08:00:00.000Z',
    );

    const before = await database.getFirstAsync(
      `SELECT
         (SELECT COUNT(*) FROM cached_mission_occurrences WHERE account_id = ?) AS occurrence_count,
         (SELECT COUNT(*) FROM mutation_queue WHERE account_id = ?) AS mutation_count`,
      accountId,
      accountId,
    );

    const draft = await prepareCalendarMissionDuplicate({
      database,
      accountId,
      occurrenceId,
      now: new Date('2026-09-08T12:00:00.000Z'),
    });

    expect(draft).toMatchObject({
      selectedDate: '2026-09-08',
      title: 'Imported appointment',
      allDay: false,
      startMinute: 9 * 60 + 15,
      endMinute: 10 * 60,
      rewardEligibility: 'eligible',
      timeZone: 'UTC',
      timeBehavior: 'local_time',
      private: true,
      location: 'Kowloon',
      notes: 'My private note',
    });
    for (const forbidden of [
      'id',
      'completionState',
      'evidenceState',
      'rewardIssuance',
      'awardedXp',
      'storyState',
      'provider',
      'externalEventId',
      'attendeeState',
      'cancellationState',
    ]) {
      expect(draft).not.toHaveProperty(forbidden);
    }

    const after = await database.getFirstAsync(
      `SELECT
         (SELECT COUNT(*) FROM cached_mission_occurrences WHERE account_id = ?) AS occurrence_count,
         (SELECT COUNT(*) FROM mutation_queue WHERE account_id = ?) AS mutation_count`,
      accountId,
      accountId,
    );
    expect(after).toEqual(before);
  });
});

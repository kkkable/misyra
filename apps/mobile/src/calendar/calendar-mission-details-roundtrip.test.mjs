import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCalendarMission } from './calendar-mission-create.js';
import { saveCalendarMissionDetails } from './calendar-mission-details-save.js';
import { runAuthenticatedServerSync } from '../sync/authenticated-sync-runtime.js';
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
const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function uuidFactory() {
  let counter = 1;
  return () => `cccccccc-cccc-4ccc-8ccc-${String(counter++).padStart(12, '0')}`;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('Mission Details cache-to-server-to-reload contract', () => {
  it('pushes the queued Details edit and converges the cache from the authoritative pull', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      `INSERT INTO local_accounts
        (account_id, created_at, language, trust_mode, app_time_zone)
       VALUES (?, ?, ?, ?, ?)`,
      accountId,
      '2026-09-09T00:00:00.000Z',
      'en',
      0,
      'UTC',
    );

    const ids = uuidFactory();
    const mission = await createCalendarMission({
      database,
      accountId,
      deviceId,
      input: {
        selectedDate: '2026-09-10',
        title: 'Initial title',
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        rewardEligibility: 'eligible',
        timeZone: 'UTC',
        location: 'Initial place',
        notes: 'Initial general note',
      },
      now: new Date('2026-09-09T08:00:00.000Z'),
      generateId: ids,
    });

    await saveCalendarMissionDetails({
      database,
      accountId,
      deviceId,
      edit: {
        missionId: mission.occurrence.id,
        title: 'Final title',
        selectedDate: '2026-09-10',
        startMinute: 10 * 60,
        endMinute: 10 * 60 + 45,
        timeZone: 'UTC',
        location: 'Final place',
        notes: 'Final general note',
      },
      now: new Date('2026-09-09T08:15:00.000Z'),
      generateId: ids,
    });
    await database.runAsync(
      `UPDATE search_documents
          SET personal_note = ?
        WHERE account_id = ? AND occurrence_id = ?`,
      'Private personal note',
      accountId,
      mission.occurrence.id,
    );

    const authoritativePayload = {
      version: 2,
      series: { id: mission.series.id, title: 'Final title', recurrence: null },
      occurrence: {
        id: mission.occurrence.id,
        seriesId: mission.series.id,
        schedule: {
          localStart: '2026-09-10T10:00:00',
          localFinish: '2026-09-10T10:45:00',
          startInstant: '2026-09-10T10:00:00.000Z',
          finishInstant: '2026-09-10T10:45:00.000Z',
          timeZone: 'UTC',
          timeBehavior: 'local_time',
          allDay: false,
          estimatedEffortMinutes: null,
        },
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
      },
      location: 'Final place',
      notes: 'Final general note',
    };

    const api = {
      push: vi.fn((mutations) => {
        expect(mutations).toHaveLength(2);
        expect(mutations[1]).toMatchObject({
          entityType: 'mission',
          entityId: mission.occurrence.id,
          operation: 'update',
          baseVersion: 1,
          payload: {
            kind: 'details',
            title: 'Final title',
            location: 'Final place',
            notes: 'Final general note',
          },
        });
        return Promise.resolve({
          acceptedMutationIds: mutations.map((mutation) => mutation.mutationId),
          conflicts: [],
        });
      }),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'mission',
              entityId: mission.occurrence.id,
              operation: 'upsert',
              payload: authoritativePayload,
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 2,
      cursor: 1,
    });

    expect(
      await database.getFirstAsync(
        'SELECT COUNT(*) AS count FROM mutation_queue WHERE account_id = ?',
        accountId,
      ),
    ).toEqual({ count: 0 });
    expect(
      await database.getFirstAsync(
        `SELECT title FROM cached_mission_series
          WHERE account_id = ? AND series_id = ?`,
        accountId,
        mission.series.id,
      ),
    ).toEqual({ title: 'Final title' });
    expect(
      await database.getFirstAsync(
        `SELECT scheduled_start, scheduled_end, server_version, payload_json
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        mission.occurrence.id,
      ),
    ).toMatchObject({ scheduled_start: '10:00', scheduled_end: '10:45', server_version: 2 });
    expect(
      await database.getFirstAsync(
        `SELECT title, location, general_note, personal_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        mission.occurrence.id,
      ),
    ).toEqual({
      title: 'Final title',
      location: 'Final place',
      general_note: 'Final general note',
      personal_note: 'Private personal note',
    });
  });
});

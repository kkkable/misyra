import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.js';
import { saveOrganizerPersonalNote } from './calendar-organizer-personal-note-save.js';

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

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const mutationId = '55555555-5555-4555-8555-555555555555';

const occurrence = {
  id: occurrenceId,
  seriesId,
  schedule: {
    localStart: '2026-09-15T09:00:00',
    localFinish: '2026-09-15T10:00:00',
    startInstant: '2026-09-15T01:00:00.000Z',
    finishInstant: '2026-09-15T02:00:00.000Z',
    timeZone: 'Asia/Hong_Kong',
    timeBehavior: 'fixed_instant',
    allDay: false,
    estimatedEffortMinutes: null,
  },
  scheduleState: 'scheduled',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  rewardIssuance: 'not_issued',
  calendarSource: 'external',
  fieldOwnership: 'organizer_controlled',
  synchronizationState: 'synced',
  storyState: 'none',
  deletionState: 'active',
};

describe('MTS-072 organizer personal-note local save', () => {
  it('queues only an app-server personal-note mutation and preserves provider text', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-13T10:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO cached_mission_series
        (account_id, series_id, title, timezone, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      seriesId,
      'Organizer meeting',
      'Asia/Hong_Kong',
      JSON.stringify({ id: seriesId, title: 'Organizer meeting', recurrence: null }),
      '2026-09-13T10:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, server_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      seriesId,
      '2026-09-15',
      '09:00',
      '10:00',
      0,
      JSON.stringify(occurrence),
      3,
      '2026-09-13T10:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, location, provider_text,
         personal_note, general_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      accountId,
      occurrenceId,
      occurrenceId,
      'Organizer meeting',
      'Central',
      'Organizer agenda',
      '2026-09-13T10:00:00.000Z',
    );

    await saveOrganizerPersonalNote({
      database,
      accountId,
      deviceId,
      occurrenceId,
      note: 'Ask privately about access',
      now: new Date('2026-09-13T10:05:00.000Z'),
      generateId: () => mutationId,
    });

    const queued = await database.getFirstAsync(
      `SELECT command_json FROM mutation_queue
        WHERE account_id = ? AND mutation_id = ?`,
      accountId,
      mutationId,
    );
    const envelope = JSON.parse(queued.command_json);
    expect(envelope).toEqual({
      mutation: {
        mutationId,
        accountId,
        deviceId,
        entityType: 'mission_personal_note',
        entityId: occurrenceId,
        operation: 'update',
        baseVersion: null,
        clientOccurredAt: '2026-09-13T10:05:00.000Z',
        payload: { note: 'Ask privately about access' },
      },
      destination: { kind: 'server' },
    });

    expect(
      await database.getFirstAsync(
        `SELECT provider_text, personal_note, general_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({
      provider_text: 'Organizer agenda',
      personal_note: 'Ask privately about access',
      general_note: null,
    });
  });
});

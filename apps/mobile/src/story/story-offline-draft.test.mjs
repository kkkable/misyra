import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.ts';
import { createStoryOfflineDraftStore } from './story-offline-draft.ts';

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
const occurrenceId = '33333333-3333-4333-8333-333333333333';
const seriesId = '44444444-4444-4444-8444-444444444444';
const draftId = '55555555-5555-4555-8555-555555555555';
const imageVersionId = '66666666-6666-4666-8666-666666666666';

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

async function seedCompletedMission(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-23T06:20:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
       (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, 'Offline Story', 'Asia/Tokyo', '{}', ?)`,
    accountId,
    seriesId,
    '2026-09-23T06:20:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
       (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
        all_day, payload_json, updated_at)
     VALUES (?, ?, ?, '2026-09-23', '18:00', '18:30', 0, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    JSON.stringify({ completionState: 'completed', deletionState: 'active' }),
    '2026-09-23T06:20:00.000Z',
  );
}

function payload(revision) {
  return {
    draftId,
    notes: { musicMood: null, mention: null, location: null, poll: null },
    imageVersions: [
      {
        id: imageVersionId,
        kind: 'source',
        storageKey: `story/source/${imageVersionId}`,
        composition: {
          canvas: { width: 1080, height: 1920 },
          background: { scale: 1, translateX: revision * 20, translateY: 0, rotation: 0 },
          headline: null,
          supportingText: null,
          effects: [],
          revision,
          savedAt: `2026-09-23T06:2${revision}:00.000Z`,
        },
      },
    ],
  };
}

describe('MTS-091 offline Story draft persistence', () => {
  it('loads an existing local Story draft without a network dependency', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    const store = createStoryOfflineDraftStore({
      database,
      accountId,
      deviceId,
      generateMutationId: () => '77777777-7777-4777-8777-777777777777',
    });
    await store.save(occurrenceId, payload(1));

    await expect(store.load(occurrenceId)).resolves.toEqual(payload(1));
  });

  it('saves manual edits locally and queues server sync without requiring a network call', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    let mutationSequence = 0;
    const store = createStoryOfflineDraftStore({
      database,
      accountId,
      deviceId,
      generateMutationId: () =>
        mutationSequence++ === 0
          ? '77777777-7777-4777-8777-777777777777'
          : '88888888-8888-4888-8888-888888888888',
      now: () => new Date('2026-09-23T06:25:00.000Z'),
    });

    await store.save(occurrenceId, payload(1));

    const stored = await database.getFirstAsync(
      `SELECT draft_id, composition_json
         FROM story_drafts
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(stored.draft_id).toBe(draftId);
    expect(JSON.parse(stored.composition_json)).toEqual(payload(1));

    const firstQueued = await database.getFirstAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence
        LIMIT 1`,
      accountId,
    );
    expect(JSON.parse(firstQueued.command_json)).toMatchObject({
      destination: { kind: 'server' },
      mutation: {
        entityType: 'story',
        entityId: occurrenceId,
        operation: 'create',
        payload: payload(1),
      },
    });

    await store.save(occurrenceId, payload(2));

    const queued = await database.getAllAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    expect(queued).toHaveLength(2);
    expect(JSON.parse(queued[1].command_json)).toMatchObject({
      destination: { kind: 'server' },
      mutation: {
        entityType: 'story',
        entityId: occurrenceId,
        operation: 'update',
        payload: payload(2),
      },
    });

    const latest = await database.getFirstAsync(
      'SELECT composition_json FROM story_drafts WHERE account_id = ? AND occurrence_id = ?',
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(latest.composition_json)).toEqual(payload(2));
  });
});

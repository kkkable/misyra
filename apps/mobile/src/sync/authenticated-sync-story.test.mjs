import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStoryOfflineDraftStore } from '../story/story-offline-draft.js';
import { createMutationQueue } from '../storage/mutation-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { runAuthenticatedServerSync } from './authenticated-sync-runtime.js';
import { storyConflictSettlementChannel } from './story-conflict-settlement-runtime.js';

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
const occurrenceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function composition(label, revision) {
  return {
    canvas: { width: 1080, height: 1920 },
    background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
    headline: { text: label, x: 120, y: 240 },
    supportingText: null,
    effects: [],
    revision,
    savedAt: '2026-09-23T09:32:00.000Z',
  };
}

async function seedCompletedMission(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-23T09:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
       (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, 'Story mission', 'Asia/Tokyo', '{}', ?)`,
    accountId,
    seriesId,
    '2026-09-23T09:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
       (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
        all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, '2026-09-23', '18:00', '18:30', 0, ?, 1, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    JSON.stringify({ completionState: 'completed', deletionState: 'active' }),
    '2026-09-23T09:31:00.000Z',
  );
}

describe('MTS-090 Story authenticated sync projection', () => {
  it('stores the authoritative Story draft with every image version composition intact', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    const payload = {
      draftId,
      notes: {
        musicMood: 'quiet',
        mention: '@friend',
        location: 'Tokyo',
        poll: { question: 'Share?', options: ['Yes', 'Later'] },
      },
      imageVersions: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          kind: 'source',
          storageKey: 'story/source/55555555-5555-4555-8555-555555555555',
          composition: composition('source', 1),
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          kind: 'generated',
          storageKey: 'story/generated/66666666-6666-4666-8666-666666666666',
          composition: composition('generated', 2),
        },
      ],
    };

    const api = {
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'story',
              entityId: occurrenceId,
              operation: 'upsert',
              payload,
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 1,
    });

    const row = await database.getFirstAsync(
      `SELECT draft_id, composition_json
         FROM story_drafts
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(row.draft_id).toBe(draftId);
    expect(JSON.parse(row.composition_json)).toEqual(payload);
  });

  it('pushes a locally queued Story save after reconnect and settles the offline mutation', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    const offlinePayload = {
      draftId,
      notes: { musicMood: 'offline', mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          kind: 'source',
          storageKey: 'story/source/77777777-7777-4777-8777-777777777777',
          composition: composition('offline reconnect', 2),
        },
      ],
    };
    const mutationId = '99999999-9999-4999-8999-999999999998';
    const store = createStoryOfflineDraftStore({
      database,
      accountId,
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      generateMutationId: () => mutationId,
    });
    await store.save(occurrenceId, offlinePayload);

    const pushed = [];
    const api = {
      push: vi.fn((mutations) => {
        pushed.push(...mutations);
        return Promise.resolve({ acceptedMutationIds: [mutationId], conflicts: [] });
      }),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [],
          nextCursor: 0,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 0 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 0,
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      mutationId,
      entityType: 'story',
      entityId: occurrenceId,
      payload: offlinePayload,
    });
    await expect(store.load(occurrenceId)).resolves.toEqual(offlinePayload);
    expect(await createMutationQueue(database, accountId).listPending()).toEqual([]);
  });

  it('reloads the authoritative Story and settles a losing in-flight mutation', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    const staleMutationId = '99999999-9999-4999-8999-999999999999';
    const stale = {
      draftId,
      notes: { musicMood: 'stale local', mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          kind: 'source',
          storageKey: 'story/source/77777777-7777-4777-8777-777777777777',
          composition: composition('stale local', 2),
        },
      ],
    };
    const newest = {
      draftId,
      notes: { musicMood: 'newest', mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          kind: 'source',
          storageKey: 'story/source/77777777-7777-4777-8777-777777777777',
          composition: composition('latest', 3),
        },
      ],
    };
    const queue = createMutationQueue(database, accountId);
    await queue.enqueue({
      mutation: {
        mutationId: staleMutationId,
        accountId,
        deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        entityType: 'story',
        entityId: occurrenceId,
        operation: 'update',
        baseVersion: null,
        clientOccurredAt: '2026-09-23T09:32:00.000Z',
        payload: stale,
      },
      destination: { kind: 'server' },
      applyLocal: async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO story_drafts
             (account_id, occurrence_id, draft_id, composition_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
             draft_id = excluded.draft_id,
             composition_json = excluded.composition_json,
             updated_at = excluded.updated_at`,
          accountId,
          occurrenceId,
          draftId,
          JSON.stringify(stale),
          '2026-09-23T09:32:00.000Z',
        );
      },
    });

    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: [],
          conflicts: [
            {
              kind: 'story_updated',
              mutationId: staleMutationId,
              storyDraftId: draftId,
            },
          ],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'story',
              entityId: occurrenceId,
              operation: 'upsert',
              payload: newest,
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    const settlements = [];
    const unsubscribe = storyConflictSettlementChannel.subscribe((settlement) => {
      settlements.push(settlement);
    });
    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 1,
    });
    unsubscribe();

    expect(settlements).toEqual([{ storyDraftId: draftId, occurrenceId }]);

    const row = await database.getFirstAsync(
      'SELECT composition_json FROM story_drafts WHERE account_id = ? AND occurrence_id = ?',
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(row.composition_json)).toEqual(newest);
    expect(await queue.listPending()).toEqual([]);
  });

  it('does not overwrite a Story edit queued after the push phase with an older pull', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await seedCompletedMission(database);

    const localPayload = {
      draftId,
      notes: { musicMood: 'local', mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          kind: 'source',
          storageKey: 'story/source/88888888-8888-4888-8888-888888888888',
          composition: composition('local edit', 4),
        },
      ],
    };
    const olderServerPayload = {
      draftId,
      notes: { musicMood: 'server old', mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          kind: 'source',
          storageKey: 'story/source/88888888-8888-4888-8888-888888888888',
          composition: composition('server old', 3),
        },
      ],
    };
    const queue = createMutationQueue(database, accountId);

    const api = {
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(async () => {
        await queue.enqueue({
          mutation: {
            mutationId: '99999999-9999-4999-8999-999999999999',
            accountId,
            deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            entityType: 'story',
            entityId: occurrenceId,
            operation: 'update',
            baseVersion: null,
            clientOccurredAt: '2026-09-23T09:35:00.000Z',
            payload: localPayload,
          },
          destination: { kind: 'server' },
          applyLocal: async (transaction) => {
            await transaction.runAsync(
              `INSERT INTO story_drafts
                 (account_id, occurrence_id, draft_id, composition_json, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
                 draft_id = excluded.draft_id,
                 composition_json = excluded.composition_json,
                 updated_at = excluded.updated_at`,
              accountId,
              occurrenceId,
              draftId,
              JSON.stringify(localPayload),
              '2026-09-23T09:35:00.000Z',
            );
          },
        });
        return {
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'story',
              entityId: occurrenceId,
              operation: 'upsert',
              payload: olderServerPayload,
            },
          ],
          nextCursor: 1,
          hasMore: false,
        };
      }),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await runAuthenticatedServerSync({ database, accountId, api });

    const row = await database.getFirstAsync(
      'SELECT composition_json FROM story_drafts WHERE account_id = ? AND occurrence_id = ?',
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(row.composition_json)).toEqual(localPayload);
    expect(await queue.listPending()).toHaveLength(1);
  });
});

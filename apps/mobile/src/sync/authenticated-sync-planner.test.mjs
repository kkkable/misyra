import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAiPlannerDraftPersistence } from '../ai-planner/ai-planner-draft-persistence.js';
import { createMutationQueue } from '../storage/mutation-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { runAuthenticatedServerSync } from './authenticated-sync-runtime.js';

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

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-086 Planner authenticated sync projection', () => {
  it('preserves a Planner edit queued after the push phase while an older pull is applied', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-21T12:00:00.000Z',
    );

    const persistence = createAiPlannerDraftPersistence({
      database,
      accountId,
      deviceId,
      generateMutationId: () => '33333333-3333-4333-8333-333333333333',
      now: () => new Date('2026-09-21T12:00:30.000Z'),
    });

    const api = {
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(async () => {
        await persistence.save({ text: 'new local edit', imageAssetIds: [] });
        return {
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'planner',
              entityId: accountId,
              operation: 'upsert',
              payload: { text: 'older server copy', imageAssetIds: [] },
            },
          ],
          nextCursor: 1,
          hasMore: false,
        };
      }),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 1,
    });

    const row = await database.getFirstAsync(
      'SELECT content_json FROM planner_drafts WHERE account_id = ?',
      accountId,
    );
    expect(JSON.parse(row.content_json)).toEqual({
      text: 'new local edit',
      imageAssetIds: [],
    });

    const pending = await createMutationQueue(database, accountId).listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({
      entityType: 'planner',
      payload: { text: 'new local edit', imageAssetIds: [] },
    });
  });

  it('applies an authoritative Planner delete by clearing the local draft and stale Planner mutation', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-22T08:10:00.000Z',
    );

    const persistence = createAiPlannerDraftPersistence({
      database,
      accountId,
      deviceId,
      generateMutationId: () => '33333333-3333-4333-8333-333333333333',
      now: () => new Date('2026-09-22T08:10:30.000Z'),
    });
    await persistence.save({ text: 'stale local draft', imageAssetIds: [] });

    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: ['33333333-3333-4333-8333-333333333333'],
          conflicts: [],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'planner',
              entityId: accountId,
              operation: 'delete',
              payload: null,
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 1,
    });
    expect(await persistence.load()).toBeNull();
    expect(await createMutationQueue(database, accountId).listPending()).toEqual([]);
  });
});

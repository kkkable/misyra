import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createMutationQueue } from '../storage/mutation-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { createAiPlannerDraftPersistence } from './ai-planner-draft-persistence.js';

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

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-086 AI Planner draft persistence', () => {
  it('keeps exactly one durable local draft across store reconstruction and queues only the latest sync save', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-21T09:40:00.000Z',
    );

    let mutationNumber = 0;
    const options = {
      database,
      accountId,
      deviceId,
      generateMutationId: () =>
        `33333333-3333-4333-8333-${String(++mutationNumber).padStart(12, '0')}`,
      now: () => new Date(`2026-09-21T09:40:0${mutationNumber}.000Z`),
    };
    const firstStore = createAiPlannerDraftPersistence(options);

    await firstStore.save({
      text: 'First version',
      imageAssetIds: ['44444444-4444-4444-8444-444444444444'],
    });
    await firstStore.save({
      text: 'Latest version with image',
      imageAssetIds: [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
    });

    expect(
      await database.getFirstAsync('SELECT COUNT(*) AS count FROM planner_drafts WHERE account_id = ?', accountId),
    ).toEqual({ count: 1 });

    const restartedStore = createAiPlannerDraftPersistence(options);
    await expect(restartedStore.load()).resolves.toMatchObject({
      draftId: accountId,
      input: {
        text: 'Latest version with image',
        imageAssetIds: [
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
        ],
      },
    });

    const pending = await createMutationQueue(database, accountId).listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      mutation: {
        accountId,
        deviceId,
        entityType: 'planner',
        entityId: accountId,
        operation: 'update',
        baseVersion: null,
        payload: {
          text: 'Latest version with image',
          imageAssetIds: [
            '44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555',
          ],
        },
      },
      destination: { kind: 'server' },
    });
  });
});

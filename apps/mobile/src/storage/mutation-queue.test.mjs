import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createMutationQueue } from './mutation-queue.js';
import { applyMobileMigrations } from './schema.js';

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

async function seedAccount(database, accountId = 'account-a') {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-04T00:00:00.000Z',
  );
}

function mutation(mutationId, operation = 'update') {
  return {
    mutationId,
    accountId: 'account-a',
    deviceId: 'device-a',
    entityType: 'mission',
    entityId: 'mission-a',
    operation,
    baseVersion: operation === 'create' ? null : 1,
    clientOccurredAt: '2026-09-04T00:00:01.000Z',
    payload: { title: `${operation} mission` },
  };
}

const server = { kind: 'server' };

describe('MTS-030 optimistic mutation queue', () => {
  it('commits optimistic local state and its mutation envelope atomically', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database);
    const queue = createMutationQueue(database, 'account-a');

    await queue.enqueue({
      mutation: mutation('mutation-create', 'create'),
      destination: server,
      applyLocal: async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO cached_mission_series
            (account_id, series_id, title, timezone, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          'account-a',
          'series-a',
          'Offline mission',
          'Asia/Hong_Kong',
          JSON.stringify({ id: 'series-a', title: 'Offline mission' }),
          '2026-09-04T00:00:01.000Z',
        );
      },
    });

    expect(
      await database.getFirstAsync(
        'SELECT title FROM cached_mission_series WHERE series_id = ?',
        'series-a',
      ),
    ).toEqual({ title: 'Offline mission' });
    expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
      'mutation-create',
    ]);

    await expect(
      queue.enqueue({
        mutation: mutation('mutation-failed'),
        destination: server,
        applyLocal: async (transaction) => {
          await transaction.runAsync(
            'UPDATE cached_mission_series SET title = ? WHERE series_id = ?',
            'Must roll back',
            'series-a',
          );
          throw new Error('simulated crash');
        },
      }),
    ).rejects.toThrow('simulated crash');

    expect(
      await database.getFirstAsync(
        'SELECT title FROM cached_mission_series WHERE series_id = ?',
        'series-a',
      ),
    ).toEqual({ title: 'Offline mission' });
    expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
      'mutation-create',
    ]);
  });

  it('survives queue reconstruction and retries stable IDs in strict sequence order', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database);

    const firstQueue = createMutationQueue(database, 'account-a');
    await firstQueue.enqueue({
      mutation: mutation('mutation-1', 'create'),
      destination: server,
      applyLocal: async () => {},
    });
    await firstQueue.enqueue({
      mutation: mutation('mutation-2'),
      destination: server,
      applyLocal: async () => {},
    });

    const restartedQueue = createMutationQueue(database, 'account-a');
    expect(
      (await restartedQueue.listPending()).map((item) => [item.mutation.mutationId, item.sequence]),
    ).toEqual([
      ['mutation-1', 1],
      ['mutation-2', 2],
    ]);

    const attempts = [];
    let failFirstAttempt = true;
    const firstPass = await restartedQueue.processPending({
      maxAttemptsPerMutation: 1,
      execute: async (queued) => {
        attempts.push(queued.mutation.mutationId);
        if (queued.mutation.mutationId === 'mutation-1' && failFirstAttempt) {
          failFirstAttempt = false;
          throw new Error('offline');
        }
      },
    });
    expect(firstPass).toEqual({ processed: 0, remaining: 2, stoppedOn: 'mutation-1' });
    expect(attempts).toEqual(['mutation-1']);

    const secondPass = await restartedQueue.processPending({
      maxAttemptsPerMutation: 2,
      execute: async (queued) => attempts.push(queued.mutation.mutationId),
    });
    expect(secondPass).toEqual({ processed: 2, remaining: 0, stoppedOn: null });
    expect(attempts).toEqual(['mutation-1', 'mutation-1', 'mutation-2']);
  });

  it('does not reapply optimistic state when the same durable mutation ID is retried', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database);
    const queue = createMutationQueue(database, 'account-a');
    let localApplications = 0;
    const queuedMutation = mutation('mutation-stable');

    const enqueue = () =>
      queue.enqueue({
        mutation: queuedMutation,
        destination: server,
        applyLocal: async () => {
          localApplications += 1;
        },
      });

    await enqueue();
    await enqueue();

    expect(localApplications).toBe(1);
    expect(await queue.listPending()).toHaveLength(1);
  });

  it('discards a disconnected provider command without deleting optimistic internal state', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database);
    const queue = createMutationQueue(database, 'account-a');

    await database.runAsync(
      `INSERT INTO cached_mission_series
        (account_id, series_id, title, timezone, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'account-a',
      'series-a',
      'Keep me',
      'Asia/Hong_Kong',
      JSON.stringify({ id: 'series-a', title: 'Keep me' }),
      '2026-09-04T00:00:00.000Z',
    );

    await queue.enqueue({
      mutation: mutation('internal-edit'),
      destination: server,
      applyLocal: async () => {},
    });
    await queue.enqueue({
      mutation: mutation('google-update'),
      destination: { kind: 'external_calendar', provider: 'google' },
      applyLocal: async () => {},
    });
    await queue.enqueue({
      mutation: mutation('apple-update'),
      destination: { kind: 'external_calendar', provider: 'apple' },
      applyLocal: async () => {},
    });

    expect(await queue.discardExternalCommands('google')).toBe(1);
    expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
      'internal-edit',
      'apple-update',
    ]);
    expect(
      await database.getFirstAsync(
        'SELECT title FROM cached_mission_series WHERE series_id = ?',
        'series-a',
      ),
    ).toEqual({ title: 'Keep me' });
  });
});

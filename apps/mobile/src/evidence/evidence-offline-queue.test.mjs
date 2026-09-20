import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEvidenceOfflineQueue } from './evidence-offline-queue.js';
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

async function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    'account-a',
    '2026-09-20T09:00:00.000Z',
  );
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function submission(overrides = {}) {
  return {
    mutationId: '11111111-1111-4111-8111-111111111111',
    attemptId: '22222222-2222-4222-8222-222222222222',
    occurrenceId: '33333333-3333-4333-8333-333333333333',
    submittedAt: '2026-09-20T09:05:00.000Z',
    originalUri: 'file:///private/evidence/original.jpg',
    thumbnailUris: ['file:///private/evidence/thumb-a.jpg', 'file:///private/evidence/thumb-b.jpg'],
    ...overrides,
  };
}

function queuedApi() {
  return {
    reserveAttempt: vi.fn(({ occurrenceId } = {}) => occurrenceId),
    uploadOriginal: vi.fn(),
    getResult: vi.fn(),
  };
}

describe('MTS-083 offline evidence queue', () => {
  it('survives restart, uploads automatically after reconnect, and stays Waiting until verification settles', async () => {
    const database = await createDatabase();
    const api = {
      reserveAttempt: vi.fn(() =>
        Promise.resolve({
          attemptId: submission().attemptId,
          occurrenceId: submission().occurrenceId,
          attemptNumber: 1,
          firstSubmittedAt: submission().submittedAt,
          effectiveSubmittedAt: submission().submittedAt,
          uploadPath: '/v1/media/uploads/token',
        }),
      ),
      uploadOriginal: vi.fn(() => Promise.resolve()),
      getResult: vi.fn(() => Promise.resolve({ verificationStatus: 'queued' })),
    };
    const files = { discard: vi.fn(() => Promise.resolve()) };

    const beforeRestart = createEvidenceOfflineQueue({
      database,
      accountId: 'account-a',
      deviceId: 'device-a',
      api,
      files,
    });
    await beforeRestart.enqueue(submission());

    const afterRestart = createEvidenceOfflineQueue({
      database,
      accountId: 'account-a',
      deviceId: 'device-a',
      api,
      files,
    });
    await expect(afterRestart.getPendingForOccurrence(submission().occurrenceId)).resolves.toEqual(
      submission(),
    );

    await expect(afterRestart.processPending()).resolves.toEqual({ processed: 0, remaining: 1 });
    expect(api.reserveAttempt).toHaveBeenCalledWith(submission().occurrenceId, {
      attemptId: submission().attemptId,
      submittedAt: submission().submittedAt,
    });
    expect(api.uploadOriginal).toHaveBeenCalledWith(
      '/v1/media/uploads/token',
      submission().originalUri,
    );
    await expect(afterRestart.getPendingForOccurrence(submission().occurrenceId)).resolves.toEqual(
      submission(),
    );

    api.getResult.mockResolvedValueOnce({ verificationStatus: 'accepted' });
    await expect(afterRestart.processPending()).resolves.toEqual({ processed: 1, remaining: 0 });
    await expect(
      afterRestart.getPendingForOccurrence(submission().occurrenceId),
    ).resolves.toBeNull();
    expect(files.discard).not.toHaveBeenCalled();
  });

  it('keeps the durable evidence item when reconnect upload is still unavailable', async () => {
    const database = await createDatabase();
    const api = {
      reserveAttempt: vi.fn(() => Promise.reject(new Error('offline'))),
      uploadOriginal: vi.fn(),
      getResult: vi.fn(),
    };
    const queue = createEvidenceOfflineQueue({
      database,
      accountId: 'account-a',
      deviceId: 'device-a',
      api,
      files: { discard: vi.fn() },
    });
    await queue.enqueue(submission());

    await expect(queue.processPending()).resolves.toEqual({ processed: 0, remaining: 1 });
    await expect(queue.getPendingForOccurrence(submission().occurrenceId)).resolves.toEqual(
      submission(),
    );
  });

  it('deletes the losing original and every thumbnail when another device completed first', async () => {
    const database = await createDatabase();
    const alreadyCompleted = Object.assign(new Error('already_completed'), {
      code: 'already_completed',
    });
    const api = {
      reserveAttempt: vi.fn(() => Promise.reject(alreadyCompleted)),
      uploadOriginal: vi.fn(),
      getResult: vi.fn(),
    };
    const discard = vi.fn(() => Promise.resolve());
    const queue = createEvidenceOfflineQueue({
      database,
      accountId: 'account-a',
      deviceId: 'device-b',
      api,
      files: { discard },
    });
    await queue.enqueue(submission());

    await expect(queue.processPending()).resolves.toEqual({ processed: 1, remaining: 0 });
    expect(discard.mock.calls.map(([uri]) => uri)).toEqual([
      submission().originalUri,
      ...submission().thumbnailUris,
    ]);
    await expect(queue.getPendingForOccurrence(submission().occurrenceId)).resolves.toBeNull();
  });

  it('never treats feedback media as an evidence upload queue item', async () => {
    const database = await createDatabase();
    const queue = createEvidenceOfflineQueue({
      database,
      accountId: 'account-a',
      deviceId: 'device-a',
      api: queuedApi(),
      files: { discard: vi.fn() },
    });

    await database.runAsync(
      `INSERT INTO mutation_queue
        (account_id, mutation_id, sequence, command_json, created_at)
       VALUES (?, ?, 1, ?, ?)`,
      'account-a',
      'feedback-item',
      JSON.stringify({
        mutation: {
          mutationId: 'feedback-item',
          accountId: 'account-a',
          deviceId: 'device-a',
          entityType: 'settings',
          entityId: 'account-a',
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-20T09:00:00.000Z',
          payload: { feedbackMediaUri: 'file:///private/feedback/screenshot.jpg' },
        },
        destination: { kind: 'server' },
      }),
      '2026-09-20T09:00:00.000Z',
    );

    await expect(queue.processPending()).resolves.toEqual({ processed: 0, remaining: 0 });
  });
});

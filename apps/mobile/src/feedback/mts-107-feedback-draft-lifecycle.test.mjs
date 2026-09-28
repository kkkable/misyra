import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSignOutCleanup } from '../auth/sign-out-cleanup.js';
import { accountDataTables, applyMobileMigrations } from '../storage/schema.js';
import { createFeedbackDraftStore } from './feedback-draft-store.js';

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

async function createAccountDatabase(accountId = 'account-feedback') {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-28T09:55:00.000Z',
  );
  return database;
}

function persistedSnapshot(uri = 'file:///feedback-draft.png') {
  return {
    draft: {
      category: 'problem',
      description: 'The Calendar did not refresh while offline.',
      email: 'followup@example.com',
      screenshot: {
        uri,
        mimeType: 'image/png',
        sizeBytes: 128,
      },
    },
    technicalDetails: {
      screenName: 'feedback',
      errorCodes: ['network_offline'],
      networkState: 'offline',
    },
  };
}

describe('MTS-107 offline feedback draft persistence', () => {
  it('adds an account-scoped feedback draft table that sign-out cleanup owns', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);

    await applyMobileMigrations(database);

    const table = await database.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback_drafts'",
    );
    expect(table).toEqual({ name: 'feedback_drafts' });
    expect(accountDataTables).toContain('feedback_drafts');
  });

  it('restores description, screenshot, and technical details after a new store instance', async () => {
    const accountId = 'account-restart';
    const database = await createAccountDatabase(accountId);
    const removeScreenshot = vi.fn(async () => undefined);
    const firstStore = createFeedbackDraftStore({
      database,
      accountId,
      removeScreenshot,
      now: () => new Date('2026-09-28T10:00:00.000Z'),
    });

    await firstStore.save(persistedSnapshot());

    const restartedStore = createFeedbackDraftStore({
      database,
      accountId,
      removeScreenshot,
    });
    await expect(restartedStore.load()).resolves.toEqual(persistedSnapshot());
    expect(removeScreenshot).not.toHaveBeenCalled();
  });

  it('keeps feedback drafts out of the automatic mutation/evidence queues', async () => {
    const routePath = fileURLToPath(new URL('../../app/feedback.tsx', import.meta.url));
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain('createFeedbackDraftStore');
    expect(source).not.toContain('rootSyncRuntime');
    expect(source).not.toContain('mutation_queue');
    expect(source).not.toContain('enqueueMutation');
  });
});

describe('MTS-107 manual resubmit and discard lifecycle', () => {
  it('exposes restored draft input and a confirmed discard action', async () => {
    const formPath = fileURLToPath(new URL('./feedback-form-screen.tsx', import.meta.url));
    const routePath = fileURLToPath(new URL('../../app/feedback.tsx', import.meta.url));
    const [formSource, routeSource] = await Promise.all([
      readFile(formPath, 'utf8'),
      readFile(routePath, 'utf8'),
    ]);

    expect(formSource).toContain('initialDraft');
    expect(formSource).toContain('onDraftChange');
    expect(formSource).toContain('feedback-discard-confirmation');
    expect(formSource).toContain('feedback-discard');
    expect(routeSource).toContain('.load(');
    expect(routeSource).toContain('.save(');
    expect(routeSource).toContain('.discard(');
  });

  it('deletes the stored row and working screenshot only after explicit discard', async () => {
    const accountId = 'account-discard';
    const database = await createAccountDatabase(accountId);
    const removeScreenshot = vi.fn(async () => undefined);
    const store = createFeedbackDraftStore({ database, accountId, removeScreenshot });

    await store.save(persistedSnapshot('file:///discard-me.png'));
    await store.discard();

    await expect(store.load()).resolves.toBeNull();
    expect(removeScreenshot).toHaveBeenCalledTimes(1);
    expect(removeScreenshot).toHaveBeenCalledWith('file:///discard-me.png');

    await store.discard();
    expect(removeScreenshot).toHaveBeenCalledTimes(1);
  });

  it('does not make an accepted report retryable when screenshot cleanup fails', async () => {
    const accountId = 'account-submitted';
    const database = await createAccountDatabase(accountId);
    const removeScreenshot = vi.fn(async () => {
      throw new Error('filesystem_cleanup_failed');
    });
    const store = createFeedbackDraftStore({ database, accountId, removeScreenshot });

    await store.save(persistedSnapshot('file:///submitted.png'));
    await expect(store.completeSubmission()).resolves.toBeUndefined();

    await expect(store.load()).resolves.toBeNull();
    expect(removeScreenshot).toHaveBeenCalledWith('file:///submitted.png');
  });

  it('uses a distinct post-success cleanup path from failed-submit persistence', async () => {
    const routePath = fileURLToPath(new URL('../../app/feedback.tsx', import.meta.url));
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain('completeSubmission');
  });
});

describe('MTS-108 feedback submission idempotency', () => {
  it('preserves a retry key across restart for unchanged content and rotates it after edits', async () => {
    const accountId = 'account-idempotency';
    const database = await createAccountDatabase(accountId);
    const removeScreenshot = vi.fn(async () => undefined);
    const firstStore = createFeedbackDraftStore({ database, accountId, removeScreenshot });

    const firstSnapshot = persistedSnapshot();
    await firstStore.save({
      ...firstSnapshot,
      technicalDetails: {
        ...firstSnapshot.technicalDetails,
        submissionTimestamp: '2026-09-28T12:30:00.000Z',
      },
    });
    await expect(firstStore.getOrCreateSubmissionKey(() => 'retry-key-1')).resolves.toBe(
      'retry-key-1',
    );

    const restartedStore = createFeedbackDraftStore({ database, accountId, removeScreenshot });
    await restartedStore.save({
      ...firstSnapshot,
      technicalDetails: {
        ...firstSnapshot.technicalDetails,
        submissionTimestamp: '2026-09-28T12:31:00.000Z',
      },
    });
    await expect(restartedStore.getOrCreateSubmissionKey(() => 'retry-key-2')).resolves.toBe(
      'retry-key-1',
    );

    const edited = persistedSnapshot();
    await restartedStore.save({
      ...edited,
      draft: {
        ...edited.draft,
        description: 'Edited after the failed attempt.',
      },
    });
    await expect(restartedStore.getOrCreateSubmissionKey(() => 'retry-key-3')).resolves.toBe(
      'retry-key-3',
    );
  });
});

describe('MTS-107 sign-out cleanup', () => {
  it('deletes the unsent draft and screenshot while the existing account wipe continues', async () => {
    const accountId = 'account-signout';
    const database = await createAccountDatabase(accountId);
    const removeScreenshot = vi.fn(async () => undefined);
    const store = createFeedbackDraftStore({ database, accountId, removeScreenshot });
    await store.save(persistedSnapshot('file:///signout-draft.png'));

    const cleanup = createSignOutCleanup({
      openDatabase: async () => database,
      hooks: {
        clearFeedbackDraft: () => store.discard(),
      },
    });

    await cleanup(accountId);

    expect(removeScreenshot).toHaveBeenCalledWith('file:///signout-draft.png');
    await expect(
      database.getFirstAsync(
        'SELECT account_id FROM local_accounts WHERE account_id = ?',
        accountId,
      ),
    ).resolves.toBeNull();
    await expect(
      database.getFirstAsync(
        'SELECT account_id FROM feedback_drafts WHERE account_id = ?',
        accountId,
      ),
    ).resolves.toBeNull();
  });

  it('wires platform draft cleanup into the root authentication sign-out hook', async () => {
    const authRuntimePath = fileURLToPath(new URL('../auth/auth-runtime.ts', import.meta.url));
    const source = await readFile(authRuntimePath, 'utf8');

    expect(source).toContain('clearFeedbackDraft:');
    expect(source).toContain('clearFeedbackDraftForAccount');
  });
});

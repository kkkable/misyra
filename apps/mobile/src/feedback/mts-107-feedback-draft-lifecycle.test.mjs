import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { accountDataTables, applyMobileMigrations } from '../storage/schema.js';

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
  it('restores a saved draft and exposes confirmed discard instead of automatic upload', async () => {
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
});

describe('MTS-107 sign-out cleanup', () => {
  it('wires feedback screenshot and draft cleanup into the existing sign-out cleanup hook', async () => {
    const authRuntimePath = fileURLToPath(new URL('../auth/auth-runtime.ts', import.meta.url));
    const source = await readFile(authRuntimePath, 'utf8');

    expect(source).toContain('clearFeedbackDraft:');
    expect(source).toContain('clearFeedbackDraftForAccount');
  });
});

import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MOBILE_SCHEMA_VERSION,
  accountDataTables,
  applyMigrations,
  applyMobileMigrations,
  mobileMigrations,
  wipeAccountData,
} from './schema.js';

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

  all(sql, ...params) {
    return this.database.prepare(sql).all(...params);
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
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

async function seedAccount(database, accountId) {
  const now = '2026-09-04T00:00:00.000Z';
  const seriesId = `series-${accountId}`;
  const occurrenceId = `occurrence-${accountId}`;

  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    now,
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    'Mission title',
    'Asia/Hong_Kong',
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    '2026-09-04',
    '2026-09-04T01:00:00.000Z',
    '2026-09-04T01:30:00.000Z',
    0,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO completion_summaries
      (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    now,
    10,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO personal_notes (account_id, occurrence_id, note, updated_at)
     VALUES (?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    'Private local note',
    now,
  );
  await database.runAsync(
    `INSERT INTO external_links
      (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    'google',
    `event-${accountId}`,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO hidden_event_summaries
      (account_id, hidden_event_id, starts_at, ends_at, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    `hidden-${accountId}`,
    '2026-09-04T02:00:00.000Z',
    '2026-09-04T03:00:00.000Z',
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
     VALUES (?, ?, ?, ?)`,
    accountId,
    `planner-${accountId}`,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO story_drafts
      (account_id, occurrence_id, draft_id, composition_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    `story-${accountId}`,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO search_documents
      (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    'shared-document-id',
    occurrenceId,
    `Search ${accountId}`,
    'Central',
    'Provider summary',
    'Private search note',
    now,
  );
  await database.runAsync(
    `INSERT INTO sync_cursors (account_id, cursor, updated_at) VALUES (?, ?, ?)`,
    accountId,
    `cursor-${accountId}`,
    now,
  );
  await database.runAsync(
    `INSERT INTO mutation_queue
      (account_id, mutation_id, sequence, command_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    `mutation-${accountId}`,
    1,
    '{}',
    now,
  );
  await database.runAsync(
    `INSERT INTO notification_registry
      (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    `notification-${accountId}`,
    occurrenceId,
    '2026-09-04T01:00:00.000Z',
    now,
  );
}

describe('MTS-028 mobile SQLite migrations', () => {
  it('applies ordered versioned migrations and is idempotent', async () => {
    const database = createDatabase();

    await applyMobileMigrations(database);

    const version = await database.getFirstAsync('PRAGMA user_version');
    expect(version?.user_version).toBe(MOBILE_SCHEMA_VERSION);
    expect(mobileMigrations.map((migration) => migration.version)).toEqual(
      Array.from({ length: MOBILE_SCHEMA_VERSION }, (_, index) => index + 1),
    );

    const tables = database
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'cached_mission_occurrences',
        'cached_mission_series',
        'completion_summaries',
        'external_links',
        'hidden_event_summaries',
        'local_accounts',
        'mutation_queue',
        'notification_registry',
        'personal_notes',
        'planner_drafts',
        'search_documents',
        'story_drafts',
        'sync_cursors',
      ]),
    );

    await expect(applyMobileMigrations(database)).resolves.toBeUndefined();
    expect((await database.getFirstAsync('PRAGMA user_version'))?.user_version).toBe(
      MOBILE_SCHEMA_VERSION,
    );
  });

  it('rolls back a failed migration without advancing its version', async () => {
    const database = createDatabase();
    const failingMigration = {
      version: 1,
      name: 'transaction-proof',
      statements: [
        'CREATE TABLE should_rollback (id TEXT PRIMARY KEY)',
        'THIS IS INTENTIONALLY INVALID SQL',
      ],
    };

    await expect(applyMigrations(database, [failingMigration])).rejects.toThrow();

    expect(await database.getFirstAsync('PRAGMA user_version')).toMatchObject({ user_version: 0 });
    expect(
      await database.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'",
      ),
    ).toBeNull();
  });
});

describe('MTS-028 account isolation and sign-out wipe', () => {
  it('wipes every account-owned table for only the signed-out account', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, 'account-a');
    await seedAccount(database, 'account-b');

    await wipeAccountData(database, 'account-a');

    for (const table of accountDataTables) {
      expect(
        await database.getFirstAsync(`SELECT COUNT(*) AS count FROM ${table} WHERE account_id = ?`, 'account-a'),
        `${table} retained signed-out account data`,
      ).toMatchObject({ count: 0 });
      expect(
        await database.getFirstAsync(`SELECT COUNT(*) AS count FROM ${table} WHERE account_id = ?`, 'account-b'),
        `${table} removed another account's data`,
      ).toMatchObject({ count: 1 });
    }
  });

  it('isolates searchable rows by account even when document identifiers collide', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, 'account-a');
    await seedAccount(database, 'account-b');

    expect(
      database.all(
        'SELECT account_id, title FROM search_documents WHERE account_id = ? ORDER BY document_id',
        'account-a',
      ),
    ).toEqual([{ account_id: 'account-a', title: 'Search account-a' }]);
    expect(
      database.all(
        'SELECT account_id, title FROM search_documents WHERE account_id = ? ORDER BY document_id',
        'account-b',
      ),
    ).toEqual([{ account_id: 'account-b', title: 'Search account-b' }]);
  });
});

describe('MTS-028 draft and privacy constraints', () => {
  it('allows only one Planner draft per account and one Story draft per occurrence', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, 'account-a');

    expect(() =>
      database.database
        .prepare(
          `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run('account-a', 'planner-second', '{}', '2026-09-04T00:01:00.000Z'),
    ).toThrow();

    expect(() =>
      database.database
        .prepare(
          `INSERT INTO story_drafts
            (account_id, occurrence_id, draft_id, composition_json, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          'account-a',
          'occurrence-account-a',
          'story-second',
          '{}',
          '2026-09-04T00:01:00.000Z',
        ),
    ).toThrow();
  });

  it('does not define ordinary SQLite columns for credentials, tokens, secrets, or encryption keys', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);

    const sensitiveName = /(credential|token|secret|encryption.?key)/i;
    for (const table of accountDataTables) {
      const columns = database.all(`PRAGMA table_info(${table})`);
      expect(columns.map((column) => column.name).filter((name) => sensitiveName.test(name))).toEqual([]);
    }
  });
});

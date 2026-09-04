export type SqlBindValue = string | number | null | boolean | Uint8Array;

export interface MigrationDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlBindValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;
  withExclusiveTransactionAsync(
    task: (transaction: MigrationDatabase) => Promise<void>,
  ): Promise<void>;
}

export type MobileMigration = Readonly<{
  version: number;
  name: string;
  statements: readonly string[];
}>;

export const accountDataTables = [
  'local_accounts',
  'cached_mission_series',
  'cached_mission_occurrences',
  'completion_summaries',
  'personal_notes',
  'external_links',
  'hidden_event_summaries',
  'planner_drafts',
  'story_drafts',
  'search_documents',
  'sync_cursors',
  'mutation_queue',
  'notification_registry',
] as const;

export const mobileMigrations: readonly MobileMigration[] = [
  {
    version: 1,
    name: 'account-isolated-read-model',
    statements: [
      `CREATE TABLE local_accounts (
        account_id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE cached_mission_series (
        account_id TEXT NOT NULL,
        series_id TEXT NOT NULL,
        title TEXT NOT NULL,
        timezone TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, series_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE cached_mission_occurrences (
        account_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        series_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        scheduled_start TEXT,
        scheduled_end TEXT,
        all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, occurrence_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, series_id)
          REFERENCES cached_mission_series (account_id, series_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE completion_summaries (
        account_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        awarded_xp INTEGER NOT NULL CHECK (awarded_xp >= 0),
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, occurrence_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, occurrence_id)
          REFERENCES cached_mission_occurrences (account_id, occurrence_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE personal_notes (
        account_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        note TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, occurrence_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, occurrence_id)
          REFERENCES cached_mission_occurrences (account_id, occurrence_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE external_links (
        account_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_event_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, occurrence_id, provider),
        UNIQUE (account_id, provider, external_event_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, occurrence_id)
          REFERENCES cached_mission_occurrences (account_id, occurrence_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE hidden_event_summaries (
        account_id TEXT NOT NULL,
        hidden_event_id TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, hidden_event_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE planner_drafts (
        account_id TEXT PRIMARY KEY NOT NULL,
        draft_id TEXT NOT NULL,
        content_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE story_drafts (
        account_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        composition_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, occurrence_id),
        UNIQUE (account_id, draft_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, occurrence_id)
          REFERENCES cached_mission_occurrences (account_id, occurrence_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE search_documents (
        account_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        occurrence_id TEXT,
        title TEXT NOT NULL,
        location TEXT,
        provider_text TEXT,
        personal_note TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, document_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE sync_cursors (
        account_id TEXT PRIMARY KEY NOT NULL,
        cursor TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE mutation_queue (
        account_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        command_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (account_id, mutation_id),
        UNIQUE (account_id, sequence),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE notification_registry (
        account_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, notification_id),
        FOREIGN KEY (account_id) REFERENCES local_accounts (account_id) ON DELETE CASCADE,
        FOREIGN KEY (account_id, occurrence_id)
          REFERENCES cached_mission_occurrences (account_id, occurrence_id) ON DELETE CASCADE
      )`,
    ],
  },
  {
    version: 2,
    name: 'read-model-indexes',
    statements: [
      `CREATE INDEX cached_occurrences_calendar_idx
        ON cached_mission_occurrences (account_id, local_date, scheduled_start)`,
      `CREATE INDEX hidden_events_calendar_idx
        ON hidden_event_summaries (account_id, starts_at)`,
      `CREATE INDEX search_documents_account_title_idx
        ON search_documents (account_id, title)`,
      `CREATE INDEX mutation_queue_sequence_idx
        ON mutation_queue (account_id, sequence)`,
      `CREATE INDEX notification_registry_schedule_idx
        ON notification_registry (account_id, scheduled_at)`,
    ],
  },
];

export const MOBILE_SCHEMA_VERSION = mobileMigrations.length;

function validateMigrationPlan(migrations: readonly MobileMigration[]) {
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (!Number.isSafeInteger(migration.version) || migration.version !== expectedVersion) {
      throw new Error(
        `Mobile migration versions must be contiguous from 1; expected ${expectedVersion}`,
      );
    }
  });
}

async function readUserVersion(database: MigrationDatabase) {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = Number(row?.user_version ?? 0);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error('SQLite user_version is invalid');
  }
  return version;
}

export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly MobileMigration[],
): Promise<void> {
  validateMigrationPlan(migrations);

  const currentVersion = await readUserVersion(database);
  const latestVersion = migrations.length;
  if (currentVersion > latestVersion) {
    throw new Error(
      `SQLite schema version ${currentVersion} is newer than supported version ${latestVersion}`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const statement of migration.statements) {
        await transaction.execAsync(statement);
      }
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

export async function applyMobileMigrations(database: MigrationDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON');
  await database.execAsync('PRAGMA journal_mode = WAL');
  await applyMigrations(database, mobileMigrations);
}

export async function wipeAccountData(
  database: MigrationDatabase,
  accountId: string,
): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const table of [...accountDataTables].reverse()) {
      await transaction.runAsync(`DELETE FROM ${table} WHERE account_id = ?`, accountId);
    }
  });
}

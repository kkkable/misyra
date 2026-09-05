import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { coreTables, idempotencyKeys, outboxEvents } from './schema.js';

type DatabaseModule = Record<string, unknown>;
type AsyncDatabaseFunction = (...args: unknown[]) => Promise<unknown>;

const EXPECTED_TABLES = [
  'accounts',
  'account_sessions',
  'devices',
  'user_settings',
  'mission_series',
  'mission_occurrences',
  'mission_occurrence_tombstones',
  'mission_personal_notes',
  'mission_completions',
  'evidence_attempts',
  'reward_ledger',
  'streak_days',
  'story_drafts',
  'story_image_versions',
  'story_compositions',
  'story_style_profiles',
  'ai_planner_drafts',
  'ai_planner_items',
  'external_calendar_connections',
  'external_event_links',
  'hidden_external_events',
  'calendar_sync_cursors',
  'device_sync_mutations',
  'account_change_log',
  'media_assets',
  'feedback_reports',
  'feedback_media_assets',
  'outbox_events',
  'idempotency_keys',
] as const;

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts022_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;

function dockerPsql(database: string, sql: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      postgresUser,
      '-d',
      database,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function dockerPsqlFailure(database: string, sql: string): string {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      postgresUser,
      '-d',
      database,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );

  expect(result.status).not.toBe(0);
  return `${result.stdout}${result.stderr}`;
}

function insertTimedOccurrence(
  database: string,
  accountId: string,
  seriesId: string,
  occurrenceId: string,
): void {
  dockerPsql(
    database,
    `INSERT INTO mission_occurrences (
       id,
       account_id,
       series_id,
       local_date,
       local_start,
       local_finish,
       start_instant,
       finish_instant,
       time_zone,
       time_behavior,
       all_day
     ) VALUES (
       '${occurrenceId}',
       '${accountId}',
       '${seriesId}',
       '2026-09-01',
       '09:00',
       '10:00',
       '2026-09-01T01:00:00Z',
       '2026-09-01T02:00:00Z',
       'Asia/Hong_Kong',
       'local_time',
       false
     )`,
  );
}

function requireAsyncFunction(module: DatabaseModule, name: string): AsyncDatabaseFunction {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required database function: ${name}`);
  }
  return value as AsyncDatabaseFunction;
}

function requireStringArray(module: DatabaseModule, name: string): readonly string[] {
  const value = module[name];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new TypeError(`Missing required database string array: ${name}`);
  }
  return value;
}

function drizzleUniqueIndexSignatures(): string[] {
  return coreTables
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.indexes
        .filter((candidate) => candidate.config.unique)
        .map((candidate) => {
          const columns = candidate.config.columns.map((column) => {
            const name = (column as { name?: unknown }).name;
            if (typeof name !== 'string') {
              throw new TypeError(`Unique index on ${config.name} must use named columns.`);
            }
            return name;
          });
          return `${config.name}:${columns.join(',')}`;
        });
    })
    .sort();
}

async function loadDatabaseContract() {
  const module = (await import('./index.js')) as DatabaseModule;
  return {
    applyMigrations: requireAsyncFunction(module, 'applyMigrations'),
    coreTableNames: requireStringArray(module, 'coreTableNames'),
  };
}

beforeAll(() => {
  dockerPsql('postgres', `CREATE DATABASE "${databaseName}"`);
});

afterAll(() => {
  dockerPsql('postgres', `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
});

describe('MTS-022 PostgreSQL schema contract', () => {
  it('declares every principal table from the technical specification', async () => {
    const { coreTableNames } = await loadDatabaseContract();
    expect([...coreTableNames].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it('applies migrations from an empty PostgreSQL database and has no table-name drift', async () => {
    const { applyMigrations, coreTableNames } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const actualTables = dockerPsql(
      databaseName,
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
      .split('\n')
      .filter(Boolean);

    expect(actualTables).toEqual([...coreTableNames].sort());
  });

  it('persists the canonical mission time model and separate state dimensions', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const columns = dockerPsql(
      databaseName,
      `SELECT column_name || ':' || is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'mission_occurrences'
       ORDER BY column_name`,
    );

    for (const requiredColumn of [
      'series_id:NO',
      'local_date:NO',
      'local_start:NO',
      'local_finish:NO',
      'start_instant:NO',
      'finish_instant:NO',
      'time_zone:NO',
      'time_behavior:NO',
      'all_day:NO',
      'estimated_effort_minutes:YES',
      'schedule_state:NO',
      'completion_state:NO',
      'evidence_state:NO',
      'reward_eligibility:NO',
      'reward_issuance:NO',
      'calendar_source:NO',
      'field_ownership:NO',
      'synchronization_state:NO',
      'story_state:NO',
      'deletion_state:NO',
    ]) {
      expect(columns).toContain(requiredColumn);
    }
  });

  it('keeps Drizzle unique-index declarations aligned with migrated PostgreSQL', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const migratedUniqueIndexes = dockerPsql(
      databaseName,
      `SELECT table_name || ':' || string_agg(column_name, ',' ORDER BY ordinal_position)
       FROM (
         SELECT table_rel.relname AS table_name,
                attribute.attname AS column_name,
                key_column.ordinality AS ordinal_position,
                index_data.indexrelid
         FROM pg_index index_data
         JOIN pg_class table_rel ON table_rel.oid = index_data.indrelid
         JOIN pg_namespace namespace_data ON namespace_data.oid = table_rel.relnamespace
         JOIN LATERAL unnest(index_data.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
           ON key_column.attnum > 0
         JOIN pg_attribute attribute
           ON attribute.attrelid = table_rel.oid
          AND attribute.attnum = key_column.attnum
         WHERE namespace_data.nspname = 'public'
           AND index_data.indisunique
           AND NOT index_data.indisprimary
       ) unique_columns
       GROUP BY table_name, indexrelid
       ORDER BY table_name, indexrelid`,
    )
      .split('\n')
      .filter(Boolean)
      .sort();

    expect(migratedUniqueIndexes).toEqual(drizzleUniqueIndexSignatures());
  });

  it('keeps retention-sensitive account references aligned between Drizzle and migrated PostgreSQL', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const migratedForeignKeys = dockerPsql(
      databaseName,
      `SELECT tc.table_name || ':' || ccu.table_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_schema = 'public'
         AND tc.table_name IN ('outbox_events', 'idempotency_keys')
       ORDER BY 1`,
    );

    expect(migratedForeignKeys).toBe('');
    expect(getTableConfig(outboxEvents).foreignKeys).toHaveLength(0);
    expect(getTableConfig(idempotencyKeys).foreignKeys).toHaveLength(0);
  });

  it('enforces account provider, completion, reward, and active Story uniqueness', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const accountId = randomUUID();
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();

    dockerPsql(
      databaseName,
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${accountId}', 'google', 'subject-1')`,
    );
    expect(
      dockerPsqlFailure(
        databaseName,
        `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${randomUUID()}', 'google', 'subject-1')`,
      ),
    ).toMatch(/unique|duplicate/i);

    dockerPsql(
      databaseName,
      `INSERT INTO mission_series (id, account_id, title) VALUES ('${seriesId}', '${accountId}', 'Mission')`,
    );
    insertTimedOccurrence(databaseName, accountId, seriesId, occurrenceId);

    dockerPsql(
      databaseName,
      `INSERT INTO mission_completions (id, account_id, occurrence_id, completion_type, action_time) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 'trust_mode', now())`,
    );
    expect(
      dockerPsqlFailure(
        databaseName,
        `INSERT INTO mission_completions (id, account_id, occurrence_id, completion_type, action_time) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 'private', now())`,
      ),
    ).toMatch(/unique|duplicate/i);

    dockerPsql(
      databaseName,
      `INSERT INTO reward_ledger (id, account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 30, 0, 30)`,
    );
    expect(
      dockerPsqlFailure(
        databaseName,
        `INSERT INTO reward_ledger (id, account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 30, 0, 30)`,
      ),
    ).toMatch(/unique|duplicate/i);

    dockerPsql(
      databaseName,
      `INSERT INTO story_drafts (id, account_id, occurrence_id, state) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 'active')`,
    );
    expect(
      dockerPsqlFailure(
        databaseName,
        `INSERT INTO story_drafts (id, account_id, occurrence_id, state) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 'active')`,
      ),
    ).toMatch(/unique|duplicate/i);
  });

  it('keeps minimal reward-ledger data when a completed occurrence is deleted', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const accountId = randomUUID();
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    const rewardId = randomUUID();

    dockerPsql(
      databaseName,
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${accountId}', 'google', 'subject-retained-reward')`,
    );
    dockerPsql(
      databaseName,
      `INSERT INTO mission_series (id, account_id, title) VALUES ('${seriesId}', '${accountId}', 'Completed Mission')`,
    );
    insertTimedOccurrence(databaseName, accountId, seriesId, occurrenceId);
    dockerPsql(
      databaseName,
      `INSERT INTO mission_completions (id, account_id, occurrence_id, completion_type, action_time) VALUES ('${randomUUID()}', '${accountId}', '${occurrenceId}', 'trust_mode', now())`,
    );
    dockerPsql(
      databaseName,
      `INSERT INTO reward_ledger (id, account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp) VALUES ('${rewardId}', '${accountId}', '${occurrenceId}', 30, 0, 30)`,
    );
    dockerPsql(
      databaseName,
      `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at) VALUES ('${occurrenceId}', '${accountId}', now())`,
    );
    dockerPsql(databaseName, `DELETE FROM mission_occurrences WHERE id = '${occurrenceId}'`);

    expect(
      dockerPsql(
        databaseName,
        `SELECT count(*) FROM reward_ledger WHERE id = '${rewardId}' AND occurrence_id = '${occurrenceId}'`,
      ),
    ).toBe('1');
  });

  it('installs foreign keys for the principal account and mission relationships', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const relationships = dockerPsql(
      databaseName,
      `SELECT tc.table_name || ':' || ccu.table_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_schema = 'public'
       ORDER BY 1`,
    );

    for (const relationship of [
      'mission_series:accounts',
      'mission_occurrences:mission_series',
      'mission_completions:mission_occurrences',
      'story_drafts:mission_occurrences',
      'ai_planner_items:ai_planner_drafts',
      'external_event_links:external_calendar_connections',
      'feedback_media_assets:feedback_reports',
    ]) {
      expect(relationships).toContain(relationship);
    }
  });

  it('prevents ordinary deletion of permanent occurrence tombstones', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const accountId = randomUUID();
    const occurrenceId = randomUUID();
    dockerPsql(
      databaseName,
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${accountId}', 'apple', 'subject-tombstone')`,
    );
    dockerPsql(
      databaseName,
      `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at) VALUES ('${occurrenceId}', '${accountId}', now())`,
    );

    expect(
      dockerPsqlFailure(
        databaseName,
        `DELETE FROM mission_occurrence_tombstones WHERE occurrence_id = '${occurrenceId}'`,
      ),
    ).toMatch(/tombstone|permanent|delete/i);
  });

  it('does not create content-field indexes while creating operational indexes', async () => {
    const { applyMigrations } = await loadDatabaseContract();
    await applyMigrations(databaseUrl);

    const indexDefinitions = dockerPsql(
      databaseName,
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );

    expect(indexDefinitions).toMatch(/account_id|occurrence_id|processed_at|deletion_due_at/i);
    expect(indexDefinitions).not.toMatch(
      /\((title|notes?|description|email|payload|composition|metadata)\)/i,
    );
  });
});

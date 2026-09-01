import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    dockerPsql(
      databaseName,
      `INSERT INTO mission_occurrences (id, account_id, series_id, local_date, time_zone, all_day) VALUES ('${occurrenceId}', '${accountId}', '${seriesId}', '2026-09-01', 'Asia/Hong_Kong', false)`,
    );

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
      'reward_ledger:mission_occurrences',
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

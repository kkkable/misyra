import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { completeMissionAuthoritatively } from './authoritative-completion.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts061_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
const deviceId = randomUUID();

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [accountId, `mts061-${accountId}`],
  );
  await pool.query(`
    CREATE FUNCTION mts061_pause_streak_write() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_sleep(0.2);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER mts061_pause_streak_write
    BEFORE INSERT ON streak_days
    FOR EACH ROW EXECUTE FUNCTION mts061_pause_streak_write();
  `);
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createOccurrence(localDate: string) {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  await pool.query(`INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, $3)`, [
    seriesId,
    accountId,
    `Concurrent completion ${localDate}`,
  ]);
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day, reward_eligibility
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UTC', 'local_time', false, 'eligible')`,
    [
      occurrenceId,
      accountId,
      seriesId,
      localDate,
      `${localDate}T09:00:00`,
      `${localDate}T10:00:00`,
      `${localDate}T09:00:00Z`,
      `${localDate}T10:00:00Z`,
    ],
  );
  await pool.query(
    `INSERT INTO mission_reward_basis (occurrence_id, account_id, difficulty, base_xp)
     VALUES ($1, $2, 'normal', 100)`,
    [occurrenceId, accountId],
  );
  return occurrenceId;
}

describe('MTS-061 authoritative completion total XP', () => {
  it('serializes reward totals across concurrent completions for the same account', async () => {
    const firstOccurrenceId = await createOccurrence('2026-09-12');
    const secondOccurrenceId = await createOccurrence('2026-09-13');

    const results = await Promise.all([
      completeMissionAuthoritatively(pool, {
        accountId,
        occurrenceId: firstOccurrenceId,
        completionType: 'verified_on_time',
        effectiveActionAt: '2026-09-12T09:05:00.000Z',
        deviceId,
        idempotencyKey: randomUUID(),
      }),
      completeMissionAuthoritatively(pool, {
        accountId,
        occurrenceId: secondOccurrenceId,
        completionType: 'verified_on_time',
        effectiveActionAt: '2026-09-13T09:05:00.000Z',
        deviceId,
        idempotencyKey: randomUUID(),
      }),
    ]);

    expect(results.every((result) => result.status === 'completed')).toBe(true);
    expect(results.map((result) => result.totalXp).sort((left, right) => left - right)).toEqual([
      100,
      200,
    ]);
  });
});

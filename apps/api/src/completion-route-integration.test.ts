import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from './application.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts059_route_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
let deviceId: string;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  deviceId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [accountId, `mts059-route-${accountId}`],
  );
  await pool.query(
    `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
     VALUES ($1, 'en', false, 'UTC')`,
    [accountId],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createOccurrence(day: number) {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, 'Route completion')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       reward_eligibility, evidence_state
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, 'UTC', 'local_time', false,
       'eligible', 'not_submitted'
     )`,
    [
      occurrenceId,
      accountId,
      seriesId,
      date,
      `${date}T09:00:00`,
      `${date}T10:00:00`,
      `${date}T09:00:00Z`,
      `${date}T10:00:00Z`,
    ],
  );
  await pool.query(
    `INSERT INTO mission_reward_basis (occurrence_id, account_id, difficulty, base_xp)
     VALUES ($1, $2, 'normal', 100)`,
    [occurrenceId, accountId],
  );
  return { occurrenceId, actionAt: `${date}T09:05:00.000Z` } as const;
}

function createServer() {
  return createApiApplication({
    pool,
    expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
    issueAccessToken: () => 'fixture-access-token',
    reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
    authenticate: () => ({ accountId }),
  });
}

describe('MTS-059 completion HTTP integration', () => {
  it('executes confirmed Private completion through the documented mission endpoint', async () => {
    const mission = await createOccurrence(17);
    const server = createServer();

    const response = await server.inject({
      method: 'POST',
      url: `/v1/missions/${mission.occurrenceId}/complete`,
      payload: {
        completionMode: 'private',
        effectiveActionAt: mission.actionAt,
        deviceId,
        idempotencyKey: randomUUID(),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        status: 'completed',
        occurrenceId: mission.occurrenceId,
        completionType: 'private',
        reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      },
    });
    await server.close();
  });

  it('maps the global Trust completion command to the authoritative trust-mode transaction', async () => {
    await pool.query(`UPDATE user_settings SET trust_mode = true WHERE account_id = $1`, [accountId]);
    const mission = await createOccurrence(18);
    const server = createServer();

    const response = await server.inject({
      method: 'POST',
      url: `/v1/missions/${mission.occurrenceId}/complete`,
      payload: {
        completionMode: 'trust',
        effectiveActionAt: mission.actionAt,
        deviceId,
        idempotencyKey: randomUUID(),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        status: 'completed',
        occurrenceId: mission.occurrenceId,
        completionType: 'trust_mode',
        reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      },
    });
    await server.close();
  });
});

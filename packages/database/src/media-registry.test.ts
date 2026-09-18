import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts078_registry_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-078 media registry contract', () => {
  it('tracks every app-controlled media copy and cleanup state explicitly', async () => {
    const columns = await pool.query<{ columnName: string; nullable: string }>(
      `SELECT column_name AS "columnName", is_nullable AS nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'media_assets'
        ORDER BY column_name`,
    );
    const shape = columns.rows.map((row) => `${row.columnName}:${row.nullable}`);

    for (const required of [
      'original_storage_key:YES',
      'thumbnail_storage_key:YES',
      'derivative_storage_key:YES',
      'temporary_storage_key:YES',
      'deletion_state:NO',
      'retry_state:NO',
    ]) {
      expect(shape).toContain(required);
    }
  });

  it('keeps media purpose and cleanup state within the approved registry vocabulary', async () => {
    const accountId = randomUUID();
    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
      [accountId, `mts078-registry-${accountId}`],
    );

    await expect(
      pool.query(
        `INSERT INTO media_assets
           (id, account_id, purpose, storage_key, deletion_state, retry_state)
         VALUES ($1, $2, 'unknown-media-purpose', 'invalid/key', 'active', 'ready')`,
        [randomUUID(), accountId],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        `INSERT INTO media_assets
           (id, account_id, purpose, storage_key, deletion_state, retry_state)
         VALUES ($1, $2, 'evidence-working', 'invalid/key', 'mystery', 'ready')`,
        [randomUUID(), accountId],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        `INSERT INTO media_assets
           (id, account_id, purpose, storage_key, deletion_state, retry_state)
         VALUES ($1, $2, 'evidence-working', 'invalid/key', 'active', 'mystery')`,
        [randomUUID(), accountId],
      ),
    ).rejects.toThrow();
  });
});

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationAdvisoryLockKey = 1296651097;

async function listMigrationNames(): Promise<readonly string[]> {
  const names = await readdir(migrationDirectory);
  return names.filter((name) => name.endsWith('.sql')).sort();
}

export async function applyMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationAdvisoryLockKey]);
    await client.query('CREATE SCHEMA IF NOT EXISTS misyra_meta');
    await client.query(`
      CREATE TABLE IF NOT EXISTS misyra_meta.schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migrationName of await listMigrationNames()) {
      const applied = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM misyra_meta.schema_migrations WHERE name = $1) AS exists',
        [migrationName],
      );
      if (applied.rows[0]?.exists === true) {
        continue;
      }

      const migrationSql = await readFile(
        new URL(`../migrations/${migrationName}`, import.meta.url),
        'utf8',
      );
      await client.query('BEGIN');
      try {
        await client.query(migrationSql);
        await client.query('INSERT INTO misyra_meta.schema_migrations (name) VALUES ($1)', [
          migrationName,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

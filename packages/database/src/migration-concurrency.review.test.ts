import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts022_concurrent_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;

function psql(database: string, sql: string): string {
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

beforeAll(() => {
  psql('postgres', `CREATE DATABASE "${databaseName}"`);
});

afterAll(() => {
  psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
});

describe('MTS-022 migration concurrency', () => {
  it('serializes concurrent migration runners for the same database', async () => {
    await expect(
      Promise.all([
        applyMigrations(databaseUrl),
        applyMigrations(databaseUrl),
        applyMigrations(databaseUrl),
      ]),
    ).resolves.toEqual([undefined, undefined, undefined]);

    expect(
      psql(
        databaseName,
        `SELECT count(*) FROM misyra_meta.schema_migrations WHERE name = '0000_core.sql'`,
      ),
    ).toBe('1');
  });
});

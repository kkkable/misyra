import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts022_tombstone_${randomUUID().replaceAll('-', '')}`;
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

function psqlFailure(database: string, sql: string): string {
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

beforeAll(async () => {
  psql('postgres', `CREATE DATABASE \"${databaseName}\"`);
  await applyMigrations(databaseUrl);
});

afterAll(() => {
  psql('postgres', `DROP DATABASE IF EXISTS \"${databaseName}\" WITH (FORCE)`);
});

// Review regression coverage for permanent tombstone identity and resurrection semantics.
describe('MTS-022 permanent occurrence tombstones', () => {
  it('does not allow an ordinary repository to rewrite a tombstoned occurrence id', () => {
    const accountId = randomUUID();
    const occurrenceId = randomUUID();

    psql(
      databaseName,
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${accountId}', 'google', 'tombstone-identity')`,
    );
    psql(
      databaseName,
      `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at) VALUES ('${occurrenceId}', '${accountId}', now())`,
    );

    expect(
      psqlFailure(
        databaseName,
        `UPDATE mission_occurrence_tombstones SET occurrence_id = '${randomUUID()}' WHERE occurrence_id = '${occurrenceId}'`,
      ),
    ).toMatch(/tombstone|permanent|immutable/i);
    expect(
      psql(
        databaseName,
        `SELECT occurrence_id FROM mission_occurrence_tombstones WHERE occurrence_id = '${occurrenceId}'`,
      ),
    ).toBe(occurrenceId);
  });

  it('rejects resurrection of an occurrence id after a permanent tombstone exists', () => {
    const accountId = randomUUID();
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();

    psql(
      databaseName,
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ('${accountId}', 'apple', 'tombstone-resurrection')`,
    );
    psql(
      databaseName,
      `INSERT INTO mission_series (id, account_id, title) VALUES ('${seriesId}', '${accountId}', 'Deleted Mission')`,
    );
    psql(
      databaseName,
      `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at) VALUES ('${occurrenceId}', '${accountId}', now())`,
    );

    expect(
      psqlFailure(
        databaseName,
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
      ),
    ).toMatch(/tombstone|deleted|resurrect/i);
    expect(
      psql(databaseName, `SELECT count(*) FROM mission_occurrences WHERE id = '${occurrenceId}'`),
    ).toBe('0');
  });
});

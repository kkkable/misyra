import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';
import {
  appendAccountChange,
  getAccountSnapshot,
  pullAccountChanges,
} from './account-change-log.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts026_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountA: string;
let accountB: string;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountA = randomUUID();
  accountB = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2), ($3, 'apple', $4)`,
    [accountA, `mts026-a-${accountA}`, accountB, `mts026-b-${accountB}`],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

describe('MTS-026 per-account change log and cursors', () => {
  it('allocates strictly monotonic account-isolated sequences under concurrency', async () => {
    const ids = Array.from({ length: 20 }, () => randomUUID());
    const rows = await Promise.all(
      ids.map((entityId) =>
        appendAccountChange(pool, {
          accountId: accountA,
          entityType: 'mission',
          entityId,
          operation: 'upsert',
          payload: { version: 1 },
        }),
      ),
    );
    const sequences = rows.map((row) => row.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    const other = await appendAccountChange(pool, {
      accountId: accountB,
      entityType: 'mission',
      entityId: randomUUID(),
      operation: 'upsert',
      payload: { version: 1 },
    });
    expect(other.sequence).toBe(1);
  });

  it('participates in a caller-owned transaction without committing independently', async () => {
    const client = await pool.connect();
    const entityId = randomUUID();
    try {
      await client.query('BEGIN');
      await appendAccountChange(client, {
        accountId: accountA,
        entityType: 'mission',
        entityId,
        operation: 'upsert',
        payload: { version: 1 },
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const persisted = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM account_change_log
       WHERE account_id = $1 AND entity_id = $2`,
      [accountA, entityId],
    );
    expect(persisted.rows[0]?.count).toBe('0');
  });

  it(
    'replays ordered changes and tombstones from a cursor without cross-account leakage',
    async () => {
      const entityId = randomUUID();
      const upsert = await appendAccountChange(pool, {
        accountId: accountA,
        entityType: 'mission',
        entityId,
        operation: 'upsert',
        payload: { title: 'safe-sync-value' },
      });
      const tombstone = await appendAccountChange(pool, {
        accountId: accountA,
        entityType: 'mission',
        entityId,
        operation: 'delete',
        payload: null,
      });

      const page = await pullAccountChanges(pool, {
        accountId: accountA,
        cursor: upsert.sequence,
      });
      expect(page.kind).toBe('incremental');
      if (page.kind !== 'incremental') throw new Error('expected incremental page');
      expect(page.changes.map((change) => change.sequence)).toContain(tombstone.sequence);
      expect(
        page.changes.some(
          (change) => change.operation === 'delete' && change.payload === null,
        ),
      ).toBe(true);
      expect(page.changes.every((change) => change.accountId === accountA)).toBe(true);
      expect(page.nextCursor).toBeGreaterThanOrEqual(tombstone.sequence);
    },
  );

  it(
    'makes snapshot state converge with incremental replay and requests snapshot for invalid cursors',
    async () => {
      const snapshot = await getAccountSnapshot(pool, accountA);
      const fromZero = await pullAccountChanges(pool, { accountId: accountA, cursor: 0 });
      expect(fromZero.kind).toBe('incremental');
      if (fromZero.kind !== 'incremental') throw new Error('expected incremental page');

      const latestFromReplay = new Map<string, string>();
      for (const change of fromZero.changes) {
        latestFromReplay.set(`${change.entityType}:${change.entityId}`, change.operation);
      }
      expect(
        snapshot.entries.map((entry) => [
          `${entry.entityType}:${entry.entityId}`,
          entry.operation,
        ]),
      ).toEqual([...latestFromReplay.entries()]);

      await expect(
        pullAccountChanges(pool, {
          accountId: accountA,
          cursor: snapshot.nextCursor + 1000,
        }),
      ).resolves.toMatchObject({ kind: 'snapshot_required', reason: 'invalid_cursor' });
    },
  );
});

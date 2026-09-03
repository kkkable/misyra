import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';
import {
  claimOutboxEvents,
  completeOutboxEvent,
  executeIdempotentCommand,
  failOutboxEvent,
} from './idempotency-outbox.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts025_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [accountId, `mts025-${accountId}`],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-025 idempotency and transactional outbox', () => {
  it('returns the original stable result under concurrent replay and executes work once', async () => {
    const key = randomUUID();
    let executions = 0;
    const run = () =>
      executeIdempotentCommand(pool, {
        accountId,
        key,
        requestHash: 'hash-a',
        expiresAt: new Date('2026-09-05T00:00:00Z'),
        async work({ enqueueOutbox }) {
          executions += 1;
          await enqueueOutbox({
            eventType: 'mission.changed',
            aggregateType: 'mission',
            aggregateId: randomUUID(),
          });
          return { ok: true, stableId: 'result-1' };
        },
      });

    const [first, second] = await Promise.all([run(), run()]);
    expect(first).toEqual({ ok: true, stableId: 'result-1' });
    expect(second).toEqual(first);
    expect(executions).toBe(1);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM outbox_events WHERE account_id = $1`,
      [accountId],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('commits required asynchronous work atomically and leaves only protected-reference payload data', async () => {
    const aggregateId = randomUUID();
    await executeIdempotentCommand(pool, {
      accountId,
      key: randomUUID(),
      requestHash: 'hash-b',
      expiresAt: new Date('2026-09-05T00:00:00Z'),
      async work({ enqueueOutbox }) {
        await enqueueOutbox({
          eventType: 'ai.requested',
          aggregateType: 'mission',
          aggregateId,
          protectedReference: { kind: 'media_asset', id: randomUUID() },
        });
        return { aggregateId };
      },
    });

    const claimed = await claimOutboxEvents(pool, { limit: 10 });
    const event = claimed.find((item) => item.aggregateId === aggregateId);
    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({
      protectedReference: { kind: 'media_asset' },
    });
    expect(JSON.stringify(event?.payload)).not.toContain('mission title');
  });

  it('keeps account-deletion idempotency and cleanup work after the account row is removed', async () => {
    const deletionAccountId = randomUUID();
    const key = randomUUID();
    const cleanupAggregateId = randomUUID();
    let executions = 0;
    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
      [deletionAccountId, `mts025-delete-${deletionAccountId}`],
    );

    const run = () =>
      executeIdempotentCommand(pool, {
        accountId: deletionAccountId,
        key,
        requestHash: 'delete-account-v1',
        expiresAt: new Date('2026-09-05T00:00:00Z'),
        async work({ client, enqueueOutbox }) {
          executions += 1;
          await enqueueOutbox({
            eventType: 'account.cleanup.requested',
            aggregateType: 'account',
            aggregateId: cleanupAggregateId,
          });
          await client.query(`DELETE FROM accounts WHERE id = $1`, [deletionAccountId]);
          return { deleted: true };
        },
      });

    await expect(run()).resolves.toEqual({ deleted: true });
    await expect(run()).resolves.toEqual({ deleted: true });
    expect(executions).toBe(1);

    const idempotency = await pool.query<{ response: unknown }>(
      `SELECT response FROM idempotency_keys WHERE account_id = $1 AND key = $2`,
      [deletionAccountId, key],
    );
    expect(idempotency.rows[0]?.response).toEqual({ deleted: true });

    const cleanup = await pool.query<{ accountId: string; aggregateId: string }>(
      `SELECT account_id AS "accountId", aggregate_id AS "aggregateId"
       FROM outbox_events
       WHERE aggregate_id = $1`,
      [cleanupAggregateId],
    );
    expect(cleanup.rows).toEqual([
      { accountId: deletionAccountId, aggregateId: cleanupAggregateId },
    ]);
  });

  it('allows an expired idempotency key to be reused for a new request', async () => {
    const key = randomUUID();
    let executions = 0;
    const first = await executeIdempotentCommand(pool, {
      accountId,
      key,
      requestHash: 'expired-v1',
      expiresAt: new Date(0),
      work() {
        executions += 1;
        return Promise.resolve({ version: 1 });
      },
    });
    expect(first).toEqual({ version: 1 });

    const second = await executeIdempotentCommand(pool, {
      accountId,
      key,
      requestHash: 'expired-v2',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      work() {
        executions += 1;
        return Promise.resolve({ version: 2 });
      },
    });
    expect(second).toEqual({ version: 2 });
    expect(executions).toBe(2);
  });

  it('rejects null results rather than committing an unreplayable idempotency record', async () => {
    const key = randomUUID();
    await expect(
      executeIdempotentCommand(pool, {
        accountId,
        key,
        requestHash: 'null-result',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        work() {
          return Promise.resolve(null);
        },
      }),
    ).rejects.toThrow('Idempotent command responses must be non-null JSON values');

    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM idempotency_keys WHERE account_id = $1 AND key = $2`,
      [accountId, key],
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('supports consumer retry, idempotent completion, and bounded dead-letter classification', async () => {
    const aggregateId = randomUUID();
    await executeIdempotentCommand(pool, {
      accountId,
      key: randomUUID(),
      requestHash: 'hash-c',
      expiresAt: new Date('2026-09-05T00:00:00Z'),
      async work({ enqueueOutbox }) {
        await enqueueOutbox({ eventType: 'sync.command', aggregateType: 'mission', aggregateId });
        return { queued: true };
      },
    });

    const firstClaim = (await claimOutboxEvents(pool, { limit: 10, maxAttempts: 2 })).find(
      (item) => item.aggregateId === aggregateId,
    );
    expect(firstClaim).toBeDefined();
    if (firstClaim === undefined) throw new Error('missing first claim');
    expect(
      await failOutboxEvent(pool, {
        id: firstClaim.id,
        claimToken: firstClaim.claimToken,
        failureClass: 'transient',
        retryAt: new Date(0),
        maxAttempts: 2,
      }),
    ).toBe('retry');

    const secondClaim = (await claimOutboxEvents(pool, { limit: 10, maxAttempts: 2 })).find(
      (item) => item.aggregateId === aggregateId,
    );
    expect(secondClaim?.attemptCount).toBe(2);
    if (secondClaim === undefined) throw new Error('missing second claim');
    expect(
      await failOutboxEvent(pool, {
        id: secondClaim.id,
        claimToken: secondClaim.claimToken,
        failureClass: 'transient',
        retryAt: new Date(0),
        maxAttempts: 2,
      }),
    ).toBe('dead-letter');
    const replay = await claimOutboxEvents(pool, { limit: 10, maxAttempts: 2 });
    expect(replay.some((item) => item.aggregateId === aggregateId)).toBe(false);

    const completionAggregate = randomUUID();
    await executeIdempotentCommand(pool, {
      accountId,
      key: randomUUID(),
      requestHash: 'hash-d',
      expiresAt: new Date('2026-09-05T00:00:00Z'),
      async work({ enqueueOutbox }) {
        await enqueueOutbox({
          eventType: 'cleanup.requested',
          aggregateType: 'media',
          aggregateId: completionAggregate,
        });
        return { queued: true };
      },
    });
    const completionClaim = (await claimOutboxEvents(pool, { limit: 10 })).find(
      (item) => item.aggregateId === completionAggregate,
    );
    if (completionClaim === undefined) throw new Error('missing completion claim');
    await expect(
      completeOutboxEvent(pool, completionClaim.id, completionClaim.claimToken),
    ).resolves.toBe(true);
    await expect(
      completeOutboxEvent(pool, completionClaim.id, completionClaim.claimToken),
    ).resolves.toBe(false);
  });
});

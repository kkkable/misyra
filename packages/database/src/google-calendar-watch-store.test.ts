import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarWatchStore } from './google-calendar-watch-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts071_${randomUUID().replaceAll('-', '')}`;
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

async function createConnection(): Promise<string> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts071-${randomUUID()}`],
  );
  const accountId = account.rows[0]?.id;
  if (accountId === undefined) throw new Error('account insert returned no id');

  const connection = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', 'external_to_misyra', 'calendar-1', 'encrypted-token', 'connected')
     RETURNING id`,
    [accountId],
  );
  const connectionId = connection.rows[0]?.id;
  if (connectionId === undefined) throw new Error('connection insert returned no id');
  return connectionId;
}

const tokenHash = 'a'.repeat(64);

describe('MTS-071 PostgreSQL Google watch store', () => {
  it('persists current channels and renews them without invalidating overlap delivery', async () => {
    const connectionId = await createConnection();
    const store = createPostgresGoogleCalendarWatchStore(pool);

    await store.saveChannel({
      connectionId,
      channel: {
        channelId: 'channel-old',
        resourceId: 'resource-old',
        tokenHash,
        expiresAt: new Date('2026-09-13T12:00:00.000Z'),
      },
    });

    await expect(store.hasCurrentChannel(connectionId)).resolves.toBe(true);
    await expect(
      store.listChannelsDueForRenewal({
        before: new Date('2026-09-13T13:00:00.000Z'),
        limit: 25,
      }),
    ).resolves.toEqual([
      {
        connectionId,
        channelId: 'channel-old',
        resourceId: 'resource-old',
        tokenHash,
        expiresAt: new Date('2026-09-13T12:00:00.000Z'),
      },
    ]);

    await store.markRenewed({
      previousChannelId: 'channel-old',
      replacement: {
        channelId: 'channel-new',
        resourceId: 'resource-new',
        tokenHash,
        expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      },
    });

    await expect(store.getChannel('channel-old')).resolves.toMatchObject({
      connectionId,
      resourceId: 'resource-old',
    });
    await expect(store.getChannel('channel-new')).resolves.toMatchObject({
      connectionId,
      resourceId: 'resource-new',
    });
  });

  it('deduplicates signals durably and queues exactly one pull outbox event', async () => {
    const connectionId = await createConnection();
    const store = createPostgresGoogleCalendarWatchStore(pool);
    await store.saveChannel({
      connectionId,
      channel: {
        channelId: 'channel-dedupe',
        resourceId: 'resource-dedupe',
        tokenHash,
        expiresAt: new Date('2099-09-20T12:00:00.000Z'),
      },
    });

    const signal = {
      connectionId,
      channelId: 'channel-dedupe',
      messageNumber: '42',
      resourceState: 'exists',
    } as const;
    await expect(store.schedulePullOnce(signal)).resolves.toBe(true);
    await expect(store.schedulePullOnce(signal)).resolves.toBe(false);

    const persisted = await pool.query<{ signals: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM google_calendar_watch_signals
           WHERE channel_id = 'channel-dedupe' AND message_number = '42')::text AS signals,
         (SELECT count(*) FROM outbox_events
           WHERE aggregate_id = $1 AND event_type = 'google_calendar_pull_requested')::text AS outbox`,
      [connectionId],
    );
    expect(persisted.rows[0]).toEqual({ signals: '1', outbox: '1' });
  });

  it('stops accepting or renewing channels after disconnect', async () => {
    const connectionId = await createConnection();
    const store = createPostgresGoogleCalendarWatchStore(pool);
    await store.saveChannel({
      connectionId,
      channel: {
        channelId: 'channel-disconnected',
        resourceId: 'resource-disconnected',
        tokenHash,
        expiresAt: new Date('2099-09-20T12:00:00.000Z'),
      },
    });

    await pool.query(
      `UPDATE external_calendar_connections SET connection_state = 'disconnected' WHERE id = $1`,
      [connectionId],
    );

    await expect(store.getChannel('channel-disconnected')).resolves.toBeNull();
    await expect(store.hasCurrentChannel(connectionId)).resolves.toBe(false);
    await expect(
      store.listChannelsDueForRenewal({
        before: new Date('2100-01-01T00:00:00.000Z'),
        limit: 25,
      }),
    ).resolves.toEqual([]);
  });
});

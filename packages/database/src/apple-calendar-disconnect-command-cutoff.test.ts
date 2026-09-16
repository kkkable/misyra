import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAppleCalendarConnectionStore } from './apple-calendar-connection-store.js';
import { createPostgresAppleCalendarDeviceCommandStore } from './apple-calendar-device-command-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_disconnect_${randomUUID().replaceAll('-', '')}`;
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

async function insertAccount(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('apple', $1)
     RETURNING id`,
    [`mts077-disconnect-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('account insert returned no id');
  return id;
}

async function queueDelete(input: {
  accountId: string;
  connectionId: string;
  providerEventId: string;
}) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO outbox_events (
       account_id,
       event_type,
       aggregate_type,
       aggregate_id,
       payload
     )
     VALUES (
       $1,
       'external_calendar.event.delete_requested',
       'mission_occurrence',
       $2,
       jsonb_build_object(
         'connectionId', $3::text,
         'providerEventId', $4::text,
         'recurrenceScope', 'entire_series'
       )
     )
     RETURNING id`,
    [input.accountId, randomUUID(), input.connectionId, input.providerEventId],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('outbox insert returned no id');
  return id;
}

describe('MTS-077 Apple disconnect command cutoff', () => {
  it('discards pre-disconnect commands and allows commands queued after reconnect', async () => {
    const accountId = await insertAccount();
    const connectionStore = createPostgresAppleCalendarConnectionStore(pool);
    const first = await connectionStore.connect({
      accountId,
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'misyra_to_external',
    });
    const staleCommandId = await queueDelete({
      accountId,
      connectionId: first.id,
      providerEventId: 'eventkit-stale-1',
    });

    await expect(connectionStore.disconnectConnection(accountId, first.id)).resolves.toBe(true);
    const reconnected = await connectionStore.connect({
      accountId,
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'misyra_to_external',
    });
    expect(reconnected.id).toBe(first.id);

    const commandStore = createPostgresAppleCalendarDeviceCommandStore(pool);
    await expect(commandStore.claimNext(accountId)).resolves.toBeNull();

    const stale = await pool.query<{ processedAt: Date | null }>(
      `SELECT processed_at AS "processedAt" FROM outbox_events WHERE id = $1`,
      [staleCommandId],
    );
    expect(stale.rows[0]?.processedAt).toBeInstanceOf(Date);

    const freshCommandId = await queueDelete({
      accountId,
      connectionId: reconnected.id,
      providerEventId: 'eventkit-fresh-1',
    });
    await expect(commandStore.claimNext(accountId)).resolves.toMatchObject({
      command: {
        commandId: freshCommandId,
        operation: 'delete',
        providerEventId: 'eventkit-fresh-1',
        recurrenceScope: 'entire_series',
      },
    });
  });

  it('invalidates an in-flight claim when disconnect happens before settlement', async () => {
    const accountId = await insertAccount();
    const connectionStore = createPostgresAppleCalendarConnectionStore(pool);
    const connection = await connectionStore.connect({
      accountId,
      providerCalendarId: 'eventkit-calendar-claimed',
      initialSyncDirection: 'misyra_to_external',
    });
    const staleCommandId = await queueDelete({
      accountId,
      connectionId: connection.id,
      providerEventId: 'eventkit-stale-claimed-1',
    });
    const commandStore = createPostgresAppleCalendarDeviceCommandStore(pool);
    const claim = await commandStore.claimNext(accountId);
    expect(claim).toMatchObject({
      command: { commandId: staleCommandId, operation: 'delete' },
    });
    if (claim === null) throw new Error('expected claimed Apple command');

    await expect(connectionStore.disconnectConnection(accountId, connection.id)).resolves.toBe(
      true,
    );
    await expect(
      commandStore.settle(accountId, {
        commandId: staleCommandId,
        claimToken: claim.claimToken,
        status: 'applied',
        providerEventId: 'eventkit-stale-claimed-1',
      }),
    ).rejects.toThrow('apple_calendar_command_claim_not_found');

    const stale = await pool.query<{
      processedAt: Date | null;
      claimToken: string | null;
    }>(
      `SELECT processed_at AS "processedAt", claim_token AS "claimToken"
         FROM outbox_events
        WHERE id = $1`,
      [staleCommandId],
    );
    expect(stale.rows[0]?.processedAt).toBeInstanceOf(Date);
    expect(stale.rows[0]?.claimToken).toBeNull();
  });
});

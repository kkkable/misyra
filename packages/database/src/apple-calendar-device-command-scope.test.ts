import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAppleCalendarDeviceCommandStore } from './apple-calendar-device-command-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_scope_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-077 Apple provider recurrence scope normalization', () => {
  it("maps retained link scope 'event' to the executable shared command scope 'entire_series'", async () => {
    const accountId = randomUUID();
    const connectionId = randomUUID();
    const occurrenceId = randomUUID();
    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject)
       VALUES ($1, 'apple', $2)`,
      [accountId, `scope-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO external_calendar_connections
        (id, account_id, provider, sync_direction, provider_calendar_id, connection_state)
       VALUES ($1, $2, 'apple', 'misyra_to_external', 'apple-calendar-1', 'connected')`,
      [connectionId, accountId],
    );
    await pool.query(
      `INSERT INTO outbox_events
        (account_id, event_type, aggregate_type, aggregate_id, payload, available_at)
       VALUES ($1, 'external_calendar.event.delete_requested', 'mission_occurrence', $2, $3::jsonb, $4)`,
      [
        accountId,
        occurrenceId,
        JSON.stringify({
          connectionId,
          providerEventId: 'eventkit-series-1',
          recurrenceScope: 'event',
        }),
        new Date('2026-09-16T08:00:00.000Z'),
      ],
    );

    const store = createPostgresAppleCalendarDeviceCommandStore(pool, {
      now: () => new Date('2026-09-16T08:30:00.000Z'),
    });

    await expect(store.claimNext(accountId)).resolves.toMatchObject({
      occurrenceId,
      command: {
        connectionId,
        operation: 'delete',
        providerEventId: 'eventkit-series-1',
        recurrenceScope: 'entire_series',
      },
    });
  });
});

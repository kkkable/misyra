import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAppleCalendarDeviceCommandStore } from './apple-calendar-device-command-store.js';
import { createPostgresEventKitSyncStore } from './apple-eventkit-sync-store.js';
import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_device_commands_${randomUUID().replaceAll('-', '')}`;
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

async function fixture(label: string) {
  const auth = createPostgresAuthStore(pool);
  const devices = createPostgresDeviceSettingsStore(pool);
  const account = await auth.findOrCreateAccount(
    'apple',
    `mts077-command-${label}-${randomUUID()}`,
  );
  const deviceId = await devices.registerDevice({
    accountId: account.id,
    installationId: `mts077-command-${label}`,
    platform: 'ios',
    appVersion: '1.0.0',
    notificationCapability: 'not_determined',
  });
  const connectionId = randomUUID();
  await pool.query(
    `INSERT INTO external_calendar_connections
      (id, account_id, provider, sync_direction, provider_calendar_id, connection_state)
     VALUES ($1, $2, 'apple', 'external_to_misyra', 'apple-calendar-1', 'connected')`,
    [connectionId, account.id],
  );
  return { accountId: account.id, deviceId, connectionId };
}

function appCreateMutation(input: { accountId: string; deviceId: string }) {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  return {
    mutationId: randomUUID(),
    accountId: input.accountId,
    deviceId: input.deviceId,
    entityType: 'mission',
    entityId: occurrenceId,
    operation: 'create',
    baseVersion: null,
    clientOccurredAt: '2026-09-16T08:00:00.000Z',
    payload: {
      series: { id: seriesId, title: 'Device mediated export', recurrence: null },
      occurrence: {
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-17T10:00:00',
          localFinish: '2026-09-17T11:00:00',
          startInstant: '2026-09-17T01:00:00.000Z',
          finishInstant: '2026-09-17T02:00:00.000Z',
          timeZone: 'Asia/Tokyo',
          timeBehavior: 'local_time',
          allDay: false,
          estimatedEffortMinutes: null,
        },
        scheduleState: 'scheduled',
        completionState: 'incomplete',
        evidenceState: 'not_submitted',
        rewardEligibility: 'eligible',
        rewardIssuance: 'not_issued',
        calendarSource: 'internal',
        fieldOwnership: 'app_owned',
        synchronizationState: 'pending',
        storyState: 'none',
        deletionState: 'active',
      },
      location: 'Provider-safe location',
      notes: 'Provider-safe note',
    },
  } as const;
}

describe('MTS-077 durable Apple device commands', () => {
  it('claims and settles one app-owned Apple command with its provider identifier', async () => {
    const fixtureValue = await fixture('create');
    const mutation = appCreateMutation(fixtureValue);
    const syncStore = createPostgresEventKitSyncStore(
      pool,
      () => new Date('2026-09-16T08:00:01.000Z'),
    );

    await expect(syncStore.push(fixtureValue.accountId, [mutation])).resolves.toEqual({
      acceptedMutationIds: [mutation.mutationId],
    });

    const queued = await pool.query<{
      id: string;
      eventType: string;
      payload: unknown;
      processedAt: Date | null;
    }>(
      `SELECT id,
              event_type AS "eventType",
              payload,
              processed_at AS "processedAt"
         FROM outbox_events
        WHERE account_id = $1
          AND aggregate_id = $2
          AND event_type = 'external_calendar.event.upsert_requested'`,
      [fixtureValue.accountId, mutation.entityId],
    );
    expect(queued.rows).toHaveLength(1);
    const queuedCommand = queued.rows[0];
    if (queuedCommand === undefined) throw new Error('expected queued Apple command');
    expect(queuedCommand).toMatchObject({
      eventType: 'external_calendar.event.upsert_requested',
      payload: { connectionId: fixtureValue.connectionId },
      processedAt: null,
    });
    expect(JSON.stringify(queuedCommand.payload)).not.toContain('Device mediated export');
    expect(JSON.stringify(queuedCommand.payload)).not.toContain('Provider-safe note');
    await pool.query('UPDATE outbox_events SET available_at = $2 WHERE id = $1', [
      queuedCommand.id,
      new Date('2026-09-16T08:00:30.000Z'),
    ]);

    const commandStore = createPostgresAppleCalendarDeviceCommandStore(pool, {
      now: () => new Date('2026-09-16T08:01:00.000Z'),
    });
    const firstClaim = await commandStore.claimNext(fixtureValue.accountId);
    expect(firstClaim).toMatchObject({
      occurrenceId: mutation.entityId,
      providerCalendarId: 'apple-calendar-1',
      command: {
        commandId: queuedCommand.id,
        connectionId: fixtureValue.connectionId,
        operation: 'create',
        event: {
          title: 'Device mediated export',
          location: 'Provider-safe location',
          providerNotes: 'Provider-safe note',
        },
      },
    });
    expect(JSON.stringify(firstClaim?.command)).not.toContain('completionState');
    expect(JSON.stringify(firstClaim?.command)).not.toContain('evidenceState');
    expect(JSON.stringify(firstClaim?.command)).not.toContain('reward');
    expect(JSON.stringify(firstClaim?.command)).not.toContain('personal');

    await expect(commandStore.claimNext(fixtureValue.accountId)).resolves.toBeNull();
    if (firstClaim === null) throw new Error('expected Apple command claim');

    await commandStore.settle(fixtureValue.accountId, {
      commandId: firstClaim.command.commandId,
      claimToken: firstClaim.claimToken,
      status: 'applied',
      providerEventId: 'eventkit-created-1',
    });

    const link = await pool.query<{
      connectionId: string;
      occurrenceId: string;
      providerEventId: string;
    }>(
      `SELECT connection_id AS "connectionId",
              occurrence_id AS "occurrenceId",
              provider_event_id AS "providerEventId"
         FROM external_event_links
        WHERE connection_id = $1 AND occurrence_id = $2`,
      [fixtureValue.connectionId, mutation.entityId],
    );
    expect(link.rows).toEqual([
      {
        connectionId: fixtureValue.connectionId,
        occurrenceId: mutation.entityId,
        providerEventId: 'eventkit-created-1',
      },
    ]);

    const settledOutbox = await pool.query<{ processedAt: Date | null }>(
      `SELECT processed_at AS "processedAt" FROM outbox_events WHERE id = $1`,
      [firstClaim.command.commandId],
    );
    expect(settledOutbox.rows[0]?.processedAt).toBeInstanceOf(Date);

    const changes = await syncStore.pull(fixtureValue.accountId, { cursor: 1, limit: 25 });
    expect(changes.kind).toBe('incremental');
    if (changes.kind !== 'incremental') throw new Error('expected incremental change page');
    const missionChange = changes.changes.find(
      (change) =>
        change.entityType === 'mission' &&
        change.entityId === mutation.entityId &&
        change.operation === 'upsert',
    );
    expect(missionChange?.payload).toMatchObject({
      providerLink: {
        connectionId: fixtureValue.connectionId,
        provider: 'apple',
        providerCalendarId: 'apple-calendar-1',
        providerEventId: 'eventkit-created-1',
        ownership: 'app_owned',
      },
    });
  });
});

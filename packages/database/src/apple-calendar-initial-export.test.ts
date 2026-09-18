import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAppleCalendarConnectionStore } from './apple-calendar-connection-store.js';
import { createPostgresAppleCalendarDeviceCommandStore } from './apple-calendar-device-command-store.js';
import { createPostgresEventKitSyncStore } from './apple-eventkit-sync-store.js';
import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_initial_export_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-077 Apple initial Misyra-to-external migration', () => {
  it('seeds device-mediated create commands for eligible missions that existed before connect', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount(
      'apple',
      `mts077-initial-export-${randomUUID()}`,
    );
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `mts077-initial-export-${randomUUID()}`,
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'not_determined',
    });
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    const mutationId = randomUUID();
    const syncStore = createPostgresEventKitSyncStore(
      pool,
      () => new Date('2026-09-16T08:00:01.000Z'),
    );

    await syncStore.push(account.id, [
      {
        mutationId,
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-16T08:00:00.000Z',
        payload: {
          series: { id: seriesId, title: 'Already exists before Apple connect', recurrence: null },
          occurrence: {
            id: occurrenceId,
            seriesId,
            schedule: {
              localStart: '2026-09-18T10:00:00',
              localFinish: '2026-09-18T11:00:00',
              startInstant: '2026-09-18T01:00:00.000Z',
              finishInstant: '2026-09-18T02:00:00.000Z',
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
          location: null,
          notes: null,
        },
      },
    ]);

    const connections = createPostgresAppleCalendarConnectionStore(pool);
    const connected = await connections.connect({
      accountId: account.id,
      providerCalendarId: 'apple-calendar-1',
      initialSyncDirection: 'misyra_to_external',
    });

    const commands = createPostgresAppleCalendarDeviceCommandStore(pool, {
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });
    await expect(commands.claimNext(account.id)).resolves.toMatchObject({
      occurrenceId,
      providerCalendarId: 'apple-calendar-1',
      command: {
        connectionId: connected.id,
        operation: 'create',
        event: { title: 'Already exists before Apple connect' },
      },
    });
  });
});

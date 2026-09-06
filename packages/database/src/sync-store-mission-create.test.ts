import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mission_sync_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-044 mission create sync projector', () => {
  it('persists an accepted mission create and publishes a synced authoritative payload', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `mission-sync-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    const mutationId = randomUUID();
    const payload = {
      series: {
        id: seriesId,
        title: 'Morning mission',
        recurrence: null,
      },
      occurrence: {
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-07T09:00:00',
          localFinish: '2026-09-07T09:30:00',
          startInstant: '2026-09-07T01:00:00.000Z',
          finishInstant: '2026-09-07T01:30:00.000Z',
          timeZone: 'Asia/Hong_Kong',
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
    } as const;
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-06T17:00:00.000Z'));

    await expect(
      store.push(account.id, [
        {
          mutationId,
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'create',
          baseVersion: null,
          clientOccurredAt: '2026-09-06T17:00:00.000Z',
          payload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });

    const series = await pool.query(
      'SELECT title, recurrence_rule FROM mission_series WHERE id = $1 AND account_id = $2',
      [seriesId, account.id],
    );
    const occurrence = await pool.query(
      `SELECT local_date, local_start, local_finish, synchronization_state
         FROM mission_occurrences
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    expect(series.rows[0]).toMatchObject({ title: 'Morning mission', recurrence_rule: null });
    expect(occurrence.rows[0]).toMatchObject({
      local_date: '2026-09-07',
      local_start: '2026-09-07T09:00:00',
      local_finish: '2026-09-07T09:30:00',
      synchronization_state: 'synced',
    });

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') throw new Error('expected incremental sync page');
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.changes[0]).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'upsert',
      payload: {
        series: payload.series,
        occurrence: {
          ...payload.occurrence,
          synchronizationState: 'synced',
        },
      },
    });
  });
});

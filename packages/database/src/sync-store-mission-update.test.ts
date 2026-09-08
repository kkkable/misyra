import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { SyncMutationConflictError, createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mission_update_${randomUUID().replaceAll('-', '')}`;
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

function schedule(
  localStart: string,
  localFinish: string,
  startInstant: string,
  finishInstant: string,
) {
  return {
    localStart,
    localFinish,
    startInstant,
    finishInstant,
    timeZone: 'UTC',
    timeBehavior: 'local_time',
    allDay: false,
    estimatedEffortMinutes: null,
  } as const;
}

describe('MTS-047 mission schedule update synchronization', () => {
  it('uses occurrence versions, synchronizes schedule changes, and never restores lost XP eligibility', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `mission-update-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-07T08:00:00.000Z'));
    const initialSchedule = schedule(
      '2026-09-07T09:00:00',
      '2026-09-07T09:30:00',
      '2026-09-07T09:00:00.000Z',
      '2026-09-07T09:30:00.000Z',
    );

    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-07T08:00:00.000Z',
        payload: {
          series: { id: seriesId, title: 'Adjust me', recurrence: null },
          occurrence: {
            id: occurrenceId,
            seriesId,
            schedule: initialSchedule,
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

    const pastSchedule = schedule(
      '2026-09-07T07:30:00',
      '2026-09-07T08:00:00',
      '2026-09-07T07:30:00.000Z',
      '2026-09-07T08:00:00.000Z',
    );
    const updateMutationId = randomUUID();
    await expect(
      store.push(account.id, [
        {
          mutationId: updateMutationId,
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'update',
          baseVersion: 1,
          clientOccurredAt: '2026-09-07T08:00:00.000Z',
          payload: { schedule: pastSchedule, rewardEligibility: 'ineligible' },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [updateMutationId] });

    const moved = await pool.query(
      `SELECT local_start, local_finish, reward_eligibility, synchronization_state, version
         FROM mission_occurrences
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    expect(moved.rows[0]).toMatchObject({
      local_start: '2026-09-07T07:30:00',
      local_finish: '2026-09-07T08:00:00',
      reward_eligibility: 'ineligible',
      synchronization_state: 'synced',
      version: 2,
    });

    const undoMutationId = randomUUID();
    await store.push(account.id, [
      {
        mutationId: undoMutationId,
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'update',
        baseVersion: 2,
        clientOccurredAt: '2026-09-07T08:01:00.000Z',
        payload: { schedule: initialSchedule, rewardEligibility: 'eligible' },
      },
    ]);

    const undone = await pool.query(
      `SELECT local_start, local_finish, reward_eligibility, version
         FROM mission_occurrences
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    expect(undone.rows[0]).toMatchObject({
      local_start: '2026-09-07T09:00:00',
      local_finish: '2026-09-07T09:30:00',
      reward_eligibility: 'ineligible',
      version: 3,
    });

    await expect(
      store.push(account.id, [
        {
          mutationId: randomUUID(),
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'update',
          baseVersion: 1,
          clientOccurredAt: '2026-09-07T08:02:00.000Z',
          payload: { schedule: initialSchedule, rewardEligibility: 'ineligible' },
        },
      ]),
    ).rejects.toBeInstanceOf(SyncMutationConflictError);

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') throw new Error('expected incremental sync page');
    expect(pulled.changes).toHaveLength(3);
    expect(pulled.changes.at(-1)).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'upsert',
      payload: {
        version: 3,
        occurrence: {
          id: occurrenceId,
          schedule: initialSchedule,
          rewardEligibility: 'ineligible',
          synchronizationState: 'synced',
        },
      },
    });
  });

  it('removes XP when an already-started mission is edited into a future slot', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `after-start-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    let now = new Date('2026-09-07T08:00:00.000Z');
    const store = createPostgresSyncStore(pool, () => now);
    const initialSchedule = schedule(
      '2026-09-07T09:00:00',
      '2026-09-07T09:30:00',
      '2026-09-07T09:00:00.000Z',
      '2026-09-07T09:30:00.000Z',
    );

    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-07T08:00:00.000Z',
        payload: {
          series: { id: seriesId, title: 'Late adjustment', recurrence: null },
          occurrence: {
            id: occurrenceId,
            seriesId,
            schedule: initialSchedule,
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

    now = new Date('2026-09-07T10:00:00.000Z');
    const futureSchedule = schedule(
      '2026-09-07T11:00:00',
      '2026-09-07T11:30:00',
      '2026-09-07T11:00:00.000Z',
      '2026-09-07T11:30:00.000Z',
    );
    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'update',
        baseVersion: 1,
        clientOccurredAt: '2026-09-07T10:00:00.000Z',
        payload: { schedule: futureSchedule, rewardEligibility: 'eligible' },
      },
    ]);

    const moved = await pool.query(
      `SELECT local_start, local_finish, reward_eligibility, version
         FROM mission_occurrences
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    expect(moved.rows[0]).toMatchObject({
      local_start: '2026-09-07T11:00:00',
      local_finish: '2026-09-07T11:30:00',
      reward_eligibility: 'ineligible',
      version: 2,
    });
  });
});

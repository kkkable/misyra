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
const databaseName = `misyra_mission_delete_${randomUUID().replaceAll('-', '')}`;
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

async function createAccountDeviceAndMission(label: string) {
  const auth = createPostgresAuthStore(pool);
  const devices = createPostgresDeviceSettingsStore(pool);
  const account = await auth.findOrCreateAccount('google', `${label}-${randomUUID()}`);
  const deviceId = await devices.registerDevice({
    accountId: account.id,
    installationId: `installation-${randomUUID()}`,
    platform: 'android',
    appVersion: '1.0.0',
    notificationCapability: 'denied',
  });
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const store = createPostgresSyncStore(pool, () => new Date('2026-09-08T08:00:00.000Z'));
  const initialSchedule = schedule(
    '2026-09-08T09:00:00',
    '2026-09-08T09:30:00',
    '2026-09-08T09:00:00.000Z',
    '2026-09-08T09:30:00.000Z',
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
      clientOccurredAt: '2026-09-08T08:00:00.000Z',
      payload: {
        series: { id: seriesId, title: 'Delete me', recurrence: null },
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

  return { account, deviceId, seriesId, occurrenceId, store, initialSchedule };
}

describe('MTS-048 mission deletion synchronization', () => {
  it('accepts a stale-base delete over a later edit, emits a tombstone change, and rejects delayed edits', async () => {
    const { account, deviceId, occurrenceId, store, initialSchedule } =
      await createAccountDeviceAndMission('delete-wins-edit');
    const movedSchedule = schedule(
      '2026-09-08T10:00:00',
      '2026-09-08T10:30:00',
      '2026-09-08T10:00:00.000Z',
      '2026-09-08T10:30:00.000Z',
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
        clientOccurredAt: '2026-09-08T08:01:00.000Z',
        payload: { schedule: movedSchedule, rewardEligibility: 'eligible' },
      },
    ]);

    const deleteMutationId = randomUUID();
    await expect(
      store.push(account.id, [
        {
          mutationId: deleteMutationId,
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'delete',
          baseVersion: 1,
          clientOccurredAt: '2026-09-08T08:02:00.000Z',
          payload: null,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [deleteMutationId] });

    expect(
      (
        await pool.query(
          `SELECT deletion_state, synchronization_state, version
             FROM mission_occurrences
            WHERE id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toMatchObject({ deletion_state: 'deleted', synchronization_state: 'synced', version: 3 });
    expect(
      (
        await pool.query(
          `SELECT occurrence_id
             FROM mission_occurrence_tombstones
            WHERE occurrence_id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toEqual({ occurrence_id: occurrenceId });

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') throw new Error('expected incremental sync page');
    expect(pulled.changes.at(-1)).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'delete',
      payload: null,
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
          baseVersion: 2,
          clientOccurredAt: '2026-09-08T08:03:00.000Z',
          payload: { schedule: initialSchedule, rewardEligibility: 'eligible' },
        },
      ]),
    ).rejects.toBeInstanceOf(SyncMutationConflictError);
  });

  it('deletes completed mission visibility without reversing the minimal reward ledger record', async () => {
    const { account, deviceId, occurrenceId, store } =
      await createAccountDeviceAndMission('completed-delete');
    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed', reward_issuance = 'issued'
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    await pool.query(
      `INSERT INTO mission_completions
        (account_id, occurrence_id, completion_type, action_time)
       VALUES ($1, $2, 'verified', $3)`,
      [account.id, occurrenceId, '2026-09-08T08:03:00.000Z'],
    );
    await pool.query(
      `INSERT INTO reward_ledger
        (account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp)
       VALUES ($1, $2, 20, 5, 25)`,
      [account.id, occurrenceId],
    );

    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'delete',
        baseVersion: 1,
        clientOccurredAt: '2026-09-08T08:04:00.000Z',
        payload: null,
      },
    ]);

    expect(
      (
        await pool.query(
          `SELECT deletion_state
             FROM mission_occurrences
            WHERE id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toEqual({ deletion_state: 'deleted' });
    expect(
      (
        await pool.query(
          `SELECT base_xp, proof_bonus_xp, awarded_xp
             FROM reward_ledger
            WHERE occurrence_id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toEqual({ base_xp: 20, proof_bonus_xp: 5, awarded_xp: 25 });
    expect(
      (
        await pool.query(
          `SELECT completion_type
             FROM mission_completions
            WHERE occurrence_id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toEqual({ completion_type: 'verified' });
  });
});

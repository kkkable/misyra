import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresEventKitSyncStore } from './apple-eventkit-sync-store.js';
import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_provider_delete_${randomUUID().replaceAll('-', '')}`;
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

async function fixture(identity: string) {
  const auth = createPostgresAuthStore(pool);
  const devices = createPostgresDeviceSettingsStore(pool);
  const account = await auth.findOrCreateAccount(
    'apple',
    `apple-delete-${identity}-${randomUUID()}`,
  );
  const deviceId = await devices.registerDevice({
    accountId: account.id,
    installationId: `apple-delete-${identity}-${randomUUID()}`,
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

function providerCreate(input: {
  accountId: string;
  deviceId: string;
  connectionId: string;
  occurrenceId: string;
  seriesId: string;
  providerEventId: string;
}) {
  return {
    mutationId: randomUUID(),
    accountId: input.accountId,
    deviceId: input.deviceId,
    entityType: 'mission',
    entityId: input.occurrenceId,
    operation: 'create',
    baseVersion: null,
    clientOccurredAt: '2026-09-16T00:00:00.000Z',
    payload: {
      series: { id: input.seriesId, title: 'Apple provider event', recurrence: null },
      occurrence: {
        id: input.occurrenceId,
        seriesId: input.seriesId,
        schedule: {
          localStart: '2026-09-18T10:00:00',
          localFinish: '2026-09-18T11:00:00',
          startInstant: '2026-09-18T01:00:00.000Z',
          finishInstant: '2026-09-18T02:00:00.000Z',
          timeZone: 'Asia/Tokyo',
          timeBehavior: 'fixed_instant',
          allDay: false,
          estimatedEffortMinutes: null,
        },
        scheduleState: 'scheduled',
        completionState: 'incomplete',
        evidenceState: 'not_submitted',
        rewardEligibility: 'undetermined',
        rewardIssuance: 'not_issued',
        calendarSource: 'external',
        fieldOwnership: 'organizer_controlled',
        synchronizationState: 'pending',
        storyState: 'none',
        deletionState: 'active',
      },
      location: null,
      notes: null,
      providerLink: {
        connectionId: input.connectionId,
        provider: 'apple',
        providerCalendarId: 'apple-calendar-1',
        providerEventId: input.providerEventId,
        ownership: 'organizer_controlled',
      },
    },
  } as const;
}

function providerDelete(input: {
  accountId: string;
  deviceId: string;
  connectionId: string;
  occurrenceId: string;
  providerEventId: string;
}) {
  return {
    mutationId: randomUUID(),
    accountId: input.accountId,
    deviceId: input.deviceId,
    entityType: 'mission',
    entityId: input.occurrenceId,
    operation: 'delete',
    baseVersion: 1,
    clientOccurredAt: '2026-09-16T08:00:00.000Z',
    payload: {
      kind: 'provider_delete',
      providerLink: {
        connectionId: input.connectionId,
        provider: 'apple',
        providerCalendarId: 'apple-calendar-1',
        providerEventId: input.providerEventId,
        ownership: 'organizer_controlled',
      },
      recurrenceScope: 'this_occurrence',
    },
  } as const;
}

describe('MTS-077 Apple EventKit provider deletion projection', () => {
  it('removes a future unfinished import when Apple deletes it', async () => {
    const ids = await fixture('future');
    const occurrenceId = randomUUID();
    const seriesId = randomUUID();
    const providerEventId = `apple-event-${randomUUID()}`;
    const store = createPostgresEventKitSyncStore(
      pool,
      () => new Date('2026-09-16T08:00:01.000Z'),
    );
    await store.push(
      ids.accountId,
      [providerCreate({ ...ids, occurrenceId, seriesId, providerEventId })],
    );

    const deletion = providerDelete({ ...ids, occurrenceId, providerEventId });
    await expect(store.push(ids.accountId, [deletion])).resolves.toEqual({
      acceptedMutationIds: [deletion.mutationId],
    });

    const state = await pool.query<{ deletionState: string }>(
      `SELECT deletion_state AS "deletionState"
         FROM mission_occurrences
        WHERE account_id = $1 AND id = $2`,
      [ids.accountId, occurrenceId],
    );
    expect(state.rows[0]?.deletionState).toBe('deleted');
    await expect(
      pool.query(
        `SELECT 1 FROM mission_occurrence_tombstones
          WHERE account_id = $1 AND occurrence_id = $2 AND reason = 'provider_cancelled'`,
        [ids.accountId, occurrenceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `SELECT 1 FROM external_event_links
          WHERE connection_id = $1 AND occurrence_id = $2`,
        [ids.connectionId, occurrenceId],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });

    const pulled = await store.pull(ids.accountId, { cursor: 1, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') return;
    expect(pulled.changes[0]).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'delete',
      payload: null,
    });
  });

  it('keeps a past unfinished Apple deletion as a linked cancellation', async () => {
    const ids = await fixture('past');
    const occurrenceId = randomUUID();
    const seriesId = randomUUID();
    const providerEventId = `apple-event-${randomUUID()}`;
    const store = createPostgresEventKitSyncStore(
      pool,
      () => new Date('2026-09-16T08:00:01.000Z'),
    );
    await store.push(
      ids.accountId,
      [providerCreate({ ...ids, occurrenceId, seriesId, providerEventId })],
    );
    await pool.query(
      `UPDATE mission_occurrences
          SET local_date = '2026-09-15',
              local_start = '2026-09-15T10:00:00',
              local_finish = '2026-09-15T11:00:00',
              start_instant = '2026-09-15T01:00:00.000Z',
              finish_instant = '2026-09-15T02:00:00.000Z'
        WHERE account_id = $1 AND id = $2`,
      [ids.accountId, occurrenceId],
    );

    const deletion = providerDelete({ ...ids, occurrenceId, providerEventId });
    await store.push(ids.accountId, [deletion]);

    const state = await pool.query<{ scheduleState: string; deletionState: string }>(
      `SELECT schedule_state AS "scheduleState", deletion_state AS "deletionState"
         FROM mission_occurrences
        WHERE account_id = $1 AND id = $2`,
      [ids.accountId, occurrenceId],
    );
    expect(state.rows[0]).toEqual({ scheduleState: 'cancelled', deletionState: 'active' });
    await expect(
      pool.query(
        `SELECT 1 FROM external_event_links
          WHERE connection_id = $1 AND occurrence_id = $2`,
        [ids.connectionId, occurrenceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('keeps a completed import frozen after an Apple deletion', async () => {
    const ids = await fixture('completed');
    const occurrenceId = randomUUID();
    const seriesId = randomUUID();
    const providerEventId = `apple-event-${randomUUID()}`;
    const store = createPostgresEventKitSyncStore(
      pool,
      () => new Date('2026-09-16T08:00:01.000Z'),
    );
    await store.push(
      ids.accountId,
      [providerCreate({ ...ids, occurrenceId, seriesId, providerEventId })],
    );
    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed',
              evidence_state = 'accepted',
              reward_eligibility = 'ineligible',
              reward_issuance = 'issued',
              story_state = 'ready'
        WHERE account_id = $1 AND id = $2`,
      [ids.accountId, occurrenceId],
    );

    const deletion = providerDelete({ ...ids, occurrenceId, providerEventId });
    await store.push(ids.accountId, [deletion]);

    const state = await pool.query<{
      scheduleState: string;
      completionState: string;
      evidenceState: string;
      rewardEligibility: string;
      rewardIssuance: string;
      storyState: string;
      deletionState: string;
    }>(
      `SELECT schedule_state AS "scheduleState",
              completion_state AS "completionState",
              evidence_state AS "evidenceState",
              reward_eligibility AS "rewardEligibility",
              reward_issuance AS "rewardIssuance",
              story_state AS "storyState",
              deletion_state AS "deletionState"
         FROM mission_occurrences
        WHERE account_id = $1 AND id = $2`,
      [ids.accountId, occurrenceId],
    );
    expect(state.rows[0]).toEqual({
      scheduleState: 'scheduled',
      completionState: 'completed',
      evidenceState: 'accepted',
      rewardEligibility: 'ineligible',
      rewardIssuance: 'issued',
      storyState: 'ready',
      deletionState: 'active',
    });
    await expect(
      pool.query(
        `SELECT 1 FROM external_event_links
          WHERE connection_id = $1 AND occurrence_id = $2`,
        [ids.connectionId, occurrenceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});

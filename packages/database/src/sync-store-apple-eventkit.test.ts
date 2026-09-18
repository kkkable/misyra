import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresEventKitSyncStore } from './apple-eventkit-sync-store.js';
import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { SyncMutationValidationError } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_sync_eventkit_${randomUUID().replaceAll('-', '')}`;
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
  const account = await auth.findOrCreateAccount('apple', `eventkit-${identity}-${randomUUID()}`);
  const deviceId = await devices.registerDevice({
    accountId: account.id,
    installationId: `eventkit-${identity}`,
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
  return { account, deviceId, connectionId };
}

function providerCreateMutation(input: {
  accountId: string;
  deviceId: string;
  connectionId: string;
  occurrenceId?: string;
  seriesId?: string;
  mutationId?: string;
  providerEventId?: string;
}) {
  const occurrenceId = input.occurrenceId ?? randomUUID();
  const seriesId = input.seriesId ?? randomUUID();
  return {
    mutationId: input.mutationId ?? randomUUID(),
    accountId: input.accountId,
    deviceId: input.deviceId,
    entityType: 'mission',
    entityId: occurrenceId,
    operation: 'create',
    baseVersion: null,
    clientOccurredAt: '2026-09-16T01:00:00.000Z',
    payload: {
      series: {
        id: seriesId,
        title: 'EventKit import',
        recurrence: null,
      },
      occurrence: {
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-16T10:00:00',
          localFinish: '2026-09-16T11:00:00',
          startInstant: '2026-09-16T01:00:00.000Z',
          finishInstant: '2026-09-16T02:00:00.000Z',
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
      location: 'Tokyo',
      notes: 'Provider notes',
      providerLink: {
        connectionId: input.connectionId,
        provider: 'apple',
        providerCalendarId: 'apple-calendar-1',
        providerEventId: input.providerEventId ?? 'apple-event-1',
        ownership: 'organizer_controlled',
      },
    },
  } as const;
}

describe('MTS-077 Apple EventKit normal mobile sync projector', () => {
  it('accepts a device-originated EventKit import, persists provider linkage, and publishes it as an authoritative mission change', async () => {
    const { account, deviceId, connectionId } = await fixture('import');
    const mutation = providerCreateMutation({ accountId: account.id, deviceId, connectionId });
    const store = createPostgresEventKitSyncStore(pool, () => new Date('2026-09-16T01:00:01.000Z'));

    await expect(store.push(account.id, [mutation])).resolves.toEqual({
      acceptedMutationIds: [mutation.mutationId],
    });

    const persisted = await pool.query<{
      occurrenceId: string;
      calendarSource: string;
      fieldOwnership: string;
      providerEventId: string;
      provider: string;
      providerCalendarId: string;
    }>(
      `SELECT mo.id AS "occurrenceId",
              mo.calendar_source AS "calendarSource",
              mo.field_ownership AS "fieldOwnership",
              eel.provider_event_id AS "providerEventId",
              ecc.provider,
              ecc.provider_calendar_id AS "providerCalendarId"
         FROM mission_occurrences mo
         JOIN external_event_links eel ON eel.occurrence_id = mo.id
         JOIN external_calendar_connections ecc ON ecc.id = eel.connection_id
        WHERE mo.id = $1`,
      [mutation.entityId],
    );
    expect(persisted.rows).toEqual([
      {
        occurrenceId: mutation.entityId,
        calendarSource: 'external',
        fieldOwnership: 'organizer_controlled',
        providerEventId: 'apple-event-1',
        provider: 'apple',
        providerCalendarId: 'apple-calendar-1',
      },
    ]);

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') return;
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.changes[0]).toMatchObject({
      entityType: 'mission',
      entityId: mutation.entityId,
      operation: 'upsert',
      payload: {
        occurrence: {
          calendarSource: 'external',
          fieldOwnership: 'organizer_controlled',
          synchronizationState: 'synced',
        },
        providerLink: {
          connectionId,
          provider: 'apple',
          providerCalendarId: 'apple-calendar-1',
          providerEventId: 'apple-event-1',
          ownership: 'organizer_controlled',
        },
      },
    });
  });

  it('relinks provider identifiers but keeps a completed imported mission and its app-only state frozen', async () => {
    const { account, deviceId, connectionId } = await fixture('freeze');
    const occurrenceId = randomUUID();
    const seriesId = randomUUID();
    const providerEventId = `apple-event-${randomUUID()}`;
    const create = providerCreateMutation({
      accountId: account.id,
      deviceId,
      connectionId,
      occurrenceId,
      seriesId,
      providerEventId,
    });
    const store = createPostgresEventKitSyncStore(pool, () => new Date('2026-09-16T01:00:01.000Z'));
    await store.push(account.id, [create]);
    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed',
              evidence_state = 'accepted',
              reward_eligibility = 'ineligible',
              reward_issuance = 'issued',
              story_state = 'ready'
        WHERE account_id = $1 AND id = $2`,
      [account.id, occurrenceId],
    );

    const update = {
      mutationId: randomUUID(),
      accountId: account.id,
      deviceId,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'update',
      baseVersion: 1,
      clientOccurredAt: '2026-09-16T01:05:00.000Z',
      payload: {
        kind: 'provider_details',
        series: {
          id: seriesId,
          title: 'Provider changed after completion',
          recurrence: null,
        },
        occurrence: { ...create.payload.occurrence, synchronizationState: 'pending' },
        location: 'Changed location',
        notes: 'Changed provider notes',
        providerLink: create.payload.providerLink,
      },
    } as const;

    await expect(store.push(account.id, [update])).resolves.toEqual({
      acceptedMutationIds: [update.mutationId],
    });

    const frozen = await pool.query<{
      title: string;
      completionState: string;
      evidenceState: string;
      rewardEligibility: string;
      rewardIssuance: string;
      storyState: string;
      location: string | null;
      notes: string | null;
    }>(
      `SELECT ms.title,
              mo.completion_state AS "completionState",
              mo.evidence_state AS "evidenceState",
              mo.reward_eligibility AS "rewardEligibility",
              mo.reward_issuance AS "rewardIssuance",
              mo.story_state AS "storyState",
              mo.location,
              mo.notes
         FROM mission_occurrences mo
         JOIN mission_series ms ON ms.id = mo.series_id
        WHERE mo.account_id = $1 AND mo.id = $2`,
      [account.id, occurrenceId],
    );
    expect(frozen.rows).toEqual([
      {
        title: 'EventKit import',
        completionState: 'completed',
        evidenceState: 'accepted',
        rewardEligibility: 'ineligible',
        rewardIssuance: 'issued',
        storyState: 'ready',
        location: 'Tokyo',
        notes: 'Provider notes',
      },
    ]);

    const pulled = await store.pull(account.id, { cursor: 1, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') return;
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.changes[0]).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'upsert',
      payload: {
        occurrence: {
          completionState: 'completed',
          evidenceState: 'accepted',
          rewardEligibility: 'ineligible',
          rewardIssuance: 'issued',
          storyState: 'ready',
          calendarSource: 'external',
          fieldOwnership: 'organizer_controlled',
          synchronizationState: 'synced',
        },
        providerLink: { connectionId, providerEventId },
      },
    });
  });

  it('rejects an EventKit mutation that tries to attach a provider link owned by another account', async () => {
    const first = await fixture('ownership-first');
    const second = await fixture('ownership-second');
    const mutation = providerCreateMutation({
      accountId: first.account.id,
      deviceId: first.deviceId,
      connectionId: second.connectionId,
      providerEventId: `foreign-${randomUUID()}`,
    });
    const store = createPostgresEventKitSyncStore(pool);

    await expect(store.push(first.account.id, [mutation])).rejects.toBeInstanceOf(
      SyncMutationValidationError,
    );
  });
});

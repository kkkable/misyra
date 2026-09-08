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

async function deleteMission(input: {
  accountId: string;
  deviceId: string;
  occurrenceId: string;
  store: ReturnType<typeof createPostgresSyncStore>;
}) {
  const mutationId = randomUUID();
  await input.store.push(input.accountId, [
    {
      mutationId,
      accountId: input.accountId,
      deviceId: input.deviceId,
      entityType: 'mission',
      entityId: input.occurrenceId,
      operation: 'delete',
      baseVersion: 1,
      clientOccurredAt: '2026-09-08T08:04:00.000Z',
      payload: null,
    },
  ]);
  return mutationId;
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

  it('purges completed mission details while preserving only completion and reward history', async () => {
    const { account, deviceId, seriesId, occurrenceId, store } =
      await createAccountDeviceAndMission('completed-delete');
    const storyDraftId = randomUUID();
    const storyImageId = randomUUID();
    const storyCompositionId = randomUUID();
    const mediaId = randomUUID();

    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed',
              reward_issuance = 'issued',
              evidence_state = 'accepted',
              story_state = 'ready',
              location = 'Sensitive location',
              notes = 'Sensitive mission note'
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    await pool.query(
      `INSERT INTO mission_personal_notes (occurrence_id, account_id, note)
       VALUES ($1, $2, 'Sensitive personal note')`,
      [occurrenceId, account.id],
    );
    await pool.query(
      `INSERT INTO evidence_attempts
        (account_id, occurrence_id, attempt_number, status, submitted_at)
       VALUES ($1, $2, 1, 'accepted', $3)`,
      [account.id, occurrenceId, '2026-09-08T08:02:00.000Z'],
    );
    await pool.query(
      `INSERT INTO story_drafts (id, account_id, occurrence_id, state, ai_generation_count)
       VALUES ($1, $2, $3, 'active', 1)`,
      [storyDraftId, account.id, occurrenceId],
    );
    await pool.query(
      `INSERT INTO story_image_versions (id, draft_id, kind, storage_key)
       VALUES ($1, $2, 'generated', $3)`,
      [storyImageId, storyDraftId, `story/${occurrenceId}/generated.jpg`],
    );
    await pool.query(
      `INSERT INTO story_compositions (id, draft_id, composition)
       VALUES ($1, $2, '{"caption":"Sensitive Story text"}'::jsonb)`,
      [storyCompositionId, storyDraftId],
    );
    await pool.query(
      `INSERT INTO media_assets (id, account_id, purpose, storage_key)
       VALUES ($1, $2, 'evidence-working', $3)`,
      [mediaId, account.id, `evidence/${occurrenceId}/proof.jpg`],
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

    await deleteMission({ accountId: account.id, deviceId, occurrenceId, store });

    expect(
      (
        await pool.query(
          `SELECT deletion_state,
                  local_date::text,
                  local_start,
                  local_finish,
                  time_zone,
                  schedule_state,
                  evidence_state,
                  reward_eligibility,
                  calendar_source,
                  field_ownership,
                  story_state,
                  location,
                  notes
             FROM mission_occurrences
            WHERE id = $1 AND account_id = $2`,
          [occurrenceId, account.id],
        )
      ).rows[0],
    ).toMatchObject({
      deletion_state: 'deleted',
      local_date: '1970-01-01',
      local_start: '1970-01-01T00:00:00',
      local_finish: '1970-01-01T00:00:01',
      time_zone: 'UTC',
      schedule_state: 'cancelled',
      evidence_state: 'not_required',
      reward_eligibility: 'ineligible',
      calendar_source: 'internal',
      field_ownership: 'app_owned',
      story_state: 'none',
      location: null,
      notes: null,
    });
    expect(
      (
        await pool.query(
          `SELECT title, recurrence_rule
             FROM mission_series
            WHERE id = $1 AND account_id = $2`,
          [seriesId, account.id],
        )
      ).rows[0],
    ).toEqual({ title: 'Deleted mission', recurrence_rule: null });
    expect(
      (
        await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM mission_personal_notes WHERE occurrence_id = $1) AS personal_notes,
             (SELECT COUNT(*)::int FROM evidence_attempts WHERE occurrence_id = $1) AS evidence_attempts,
             (SELECT COUNT(*)::int FROM story_drafts WHERE occurrence_id = $1) AS story_drafts,
             (SELECT COUNT(*)::int FROM story_image_versions WHERE draft_id = $2) AS story_images,
             (SELECT COUNT(*)::int FROM story_compositions WHERE draft_id = $2) AS story_compositions`,
          [occurrenceId, storyDraftId],
        )
      ).rows[0],
    ).toEqual({
      personal_notes: 0,
      evidence_attempts: 0,
      story_drafts: 0,
      story_images: 0,
      story_compositions: 0,
    });
    expect(
      (
        await pool.query(
          `SELECT deletion_due_at IS NOT NULL AS due
             FROM media_assets
            WHERE id = $1 AND account_id = $2`,
          [mediaId, account.id],
        )
      ).rows[0],
    ).toEqual({ due: true });
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

  it('queues external deletion for user-owned events and removes the link', async () => {
    const { account, deviceId, occurrenceId, store } =
      await createAccountDeviceAndMission('external-owned-delete');
    const connectionId = randomUUID();
    const linkId = randomUUID();

    await pool.query(
      `UPDATE mission_occurrences
          SET calendar_source = 'external', field_ownership = 'app_owned'
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    await pool.query(
      `INSERT INTO external_calendar_connections
        (id, account_id, provider, sync_direction)
       VALUES ($1, $2, 'google', 'external_to_misyra')`,
      [connectionId, account.id],
    );
    await pool.query(
      `INSERT INTO external_event_links
        (id, connection_id, occurrence_id, provider_event_id, recurrence_scope)
       VALUES ($1, $2, $3, 'provider-owned-event', 'event')`,
      [linkId, connectionId, occurrenceId],
    );

    await deleteMission({ accountId: account.id, deviceId, occurrenceId, store });

    expect(
      (
        await pool.query(
          `SELECT event_type, payload
             FROM outbox_events
            WHERE account_id = $1
              AND aggregate_id = $2
              AND event_type = 'external_calendar.event.delete_requested'`,
          [account.id, occurrenceId],
        )
      ).rows[0],
    ).toMatchObject({
      event_type: 'external_calendar.event.delete_requested',
      payload: {
        connectionId,
        providerEventId: 'provider-owned-event',
        recurrenceScope: 'event',
      },
    });
    expect(
      (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM external_event_links WHERE occurrence_id = $1',
          [occurrenceId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
    expect(
      (
        await pool.query(
          `SELECT COUNT(*)::int AS count
             FROM hidden_external_events
            WHERE account_id = $1 AND connection_id = $2`,
          [account.id, connectionId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
  });

  it('hides organizer-controlled invitations without requesting external deletion', async () => {
    const { account, deviceId, occurrenceId, store } =
      await createAccountDeviceAndMission('external-invitation-delete');
    const connectionId = randomUUID();
    const linkId = randomUUID();

    await pool.query(
      `UPDATE mission_occurrences
          SET calendar_source = 'external', field_ownership = 'organizer_controlled'
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, account.id],
    );
    await pool.query(
      `INSERT INTO external_calendar_connections
        (id, account_id, provider, sync_direction)
       VALUES ($1, $2, 'google', 'external_to_misyra')`,
      [connectionId, account.id],
    );
    await pool.query(
      `INSERT INTO external_event_links
        (id, connection_id, occurrence_id, provider_event_id, recurrence_scope)
       VALUES ($1, $2, $3, 'provider-invitation', 'event')`,
      [linkId, connectionId, occurrenceId],
    );

    await deleteMission({ accountId: account.id, deviceId, occurrenceId, store });

    expect(
      (
        await pool.query(
          `SELECT provider_event_id, recurrence_scope
             FROM hidden_external_events
            WHERE account_id = $1 AND connection_id = $2`,
          [account.id, connectionId],
        )
      ).rows[0],
    ).toEqual({ provider_event_id: 'provider-invitation', recurrence_scope: 'event' });
    expect(
      (
        await pool.query(
          `SELECT COUNT(*)::int AS count
             FROM outbox_events
            WHERE account_id = $1
              AND aggregate_id = $2
              AND event_type = 'external_calendar.event.delete_requested'`,
          [account.id, occurrenceId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
    expect(
      (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM external_event_links WHERE occurrence_id = $1',
          [occurrenceId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
  });
});

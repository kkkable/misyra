import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarHiddenEventStore } from './google-calendar-hidden-event-store.js';
import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts073_hidden_${randomUUID().replaceAll('-', '')}`;
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

async function createAccountAndConnection() {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts073-${randomUUID()}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error('account insert returned no id');

  const connection = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', 'external_to_misyra', 'calendar-1', 'encrypted-token', 'connected')
     RETURNING id`,
    [accountId],
  );
  const connectionId = connection.rows[0]?.id;
  if (!connectionId) throw new Error('connection insert returned no id');
  return { accountId, connectionId };
}

function currentProviderEvent() {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId: 'provider-event-1',
    providerUpdatedAt: '2026-09-13T12:00:00.000Z',
    title: 'Current provider title',
    schedule: {
      type: 'timed' as const,
      startInstant: '2026-09-20T01:00:00.000Z',
      finishInstant: '2026-09-20T02:00:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant' as const,
    },
    recurrence: null,
    location: 'Admiralty',
    providerNotes: 'Current provider note',
    status: 'confirmed' as const,
    ownership: 'organizer_controlled' as const,
  };
}

describe('MTS-073 PostgreSQL hidden external-event restoration', () => {
  it('persists provider identity, canonical scope, and effective range when an import is dismissed', async () => {
    const { accountId, connectionId } = await createAccountAndConnection();
    const syncStore = createPostgresGoogleCalendarSyncStore(pool);

    await syncStore.reconcileFullImport(connectionId, {
      events: [currentProviderEvent()],
      cursor: 'sync-token-before-dismiss',
    });
    const linked = await pool.query<{ occurrenceId: string }>(
      `SELECT occurrence_id AS "occurrenceId"
         FROM external_event_links
        WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    const occurrenceId = linked.rows[0]?.occurrenceId;
    if (!occurrenceId) throw new Error('expected imported occurrence');

    await pool.query(
      `UPDATE mission_occurrences
          SET deletion_state = 'deleted', synchronization_state = 'synced', version = version + 1
        WHERE id = $1 AND account_id = $2`,
      [occurrenceId, accountId],
    );

    const dismissal = await pool.query<{
      provider: string;
      providerCalendarId: string;
      providerEventId: string;
      recurrenceScope: string;
      effectiveStart: Date | null;
      effectiveEnd: Date | null;
    }>(
      `SELECT provider,
              provider_calendar_id AS "providerCalendarId",
              provider_event_id AS "providerEventId",
              recurrence_scope AS "recurrenceScope",
              effective_start AS "effectiveStart",
              effective_end AS "effectiveEnd"
         FROM hidden_external_events
        WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(dismissal.rows[0]).toEqual({
      provider: 'google',
      providerCalendarId: 'calendar-1',
      providerEventId: 'provider-event-1',
      recurrenceScope: 'this_occurrence',
      effectiveStart: new Date('2026-09-20T01:00:00.000Z'),
      effectiveEnd: new Date('2026-09-20T02:00:00.000Z'),
    });
  });

  it('suppresses only the occurrence covered by a this-occurrence effective range', async () => {
    const { accountId, connectionId } = await createAccountAndConnection();
    const syncStore = createPostgresGoogleCalendarSyncStore(pool);

    await pool.query(
      `INSERT INTO hidden_external_events (
         account_id, connection_id, provider, provider_calendar_id,
         provider_event_id, recurrence_scope, effective_start, effective_end
       ) VALUES ($1, $2, 'google', 'calendar-1', 'provider-event-1',
                 'this_occurrence', $3, $4)`,
      [
        accountId,
        connectionId,
        new Date('2026-09-20T01:00:00.000Z'),
        new Date('2026-09-20T02:00:00.000Z'),
      ],
    );

    await syncStore.reconcileFullImport(connectionId, {
      events: [currentProviderEvent()],
      cursor: 'sync-token-hidden-occurrence',
    });
    const hiddenLink = await pool.query(
      `SELECT 1
         FROM external_event_links
        WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(hiddenLink.rowCount).toBe(0);

    const laterEvent = {
      ...currentProviderEvent(),
      providerUpdatedAt: '2026-09-13T12:05:00.000Z',
      schedule: {
        ...currentProviderEvent().schedule,
        startInstant: '2026-09-27T01:00:00.000Z',
        finishInstant: '2026-09-27T02:00:00.000Z',
      },
    };
    await syncStore.reconcileFullImport(connectionId, {
      events: [laterEvent],
      cursor: 'sync-token-outside-hidden-range',
    });

    const reimported = await pool.query<{ startInstant: Date }>(
      `SELECT occurrence.start_instant AS "startInstant"
         FROM external_event_links link
         JOIN mission_occurrences occurrence ON occurrence.id = link.occurrence_id
        WHERE link.connection_id = $1 AND link.provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(reimported.rows).toEqual([{ startInstant: new Date('2026-09-27T01:00:00.000Z') }]);
  });

  it('removes only the matching dismissal and reimports current details as a fresh active mission', async () => {
    const { accountId, connectionId } = await createAccountAndConnection();
    const syncStore = createPostgresGoogleCalendarSyncStore(pool);
    const hiddenEventStore = createPostgresGoogleCalendarHiddenEventStore(pool);

    await syncStore.reconcileFullImport(connectionId, {
      events: [currentProviderEvent()],
      cursor: 'sync-token-before-hide',
    });
    const original = await pool.query<{ occurrenceId: string }>(
      `SELECT occurrence_id AS "occurrenceId"
         FROM external_event_links
        WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    const originalOccurrenceId = original.rows[0]?.occurrenceId;
    if (!originalOccurrenceId) throw new Error('expected imported occurrence');

    await pool.query(
      `UPDATE mission_occurrences
          SET deletion_state = 'deleted', synchronization_state = 'synced', version = version + 1
        WHERE id = $1 AND account_id = $2`,
      [originalOccurrenceId, accountId],
    );
    await pool.query(
      `UPDATE hidden_external_events
          SET recurrence_scope = 'this_occurrence'
        WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    await pool.query(
      `INSERT INTO hidden_external_events (
         account_id, connection_id, provider_event_id, recurrence_scope
       ) VALUES ($1, $2, 'other-provider-event', 'entire_series')`,
      [accountId, connectionId],
    );

    const restored = await hiddenEventStore.restoreHiddenEvent(connectionId, {
      recurrenceScope: 'this_occurrence',
      event: currentProviderEvent(),
    });

    expect(restored.occurrenceId).not.toBe(originalOccurrenceId);

    const dismissals = await pool.query<{ providerEventId: string; recurrenceScope: string }>(
      `SELECT provider_event_id AS "providerEventId", recurrence_scope AS "recurrenceScope"
         FROM hidden_external_events
        WHERE connection_id = $1
        ORDER BY provider_event_id`,
      [connectionId],
    );
    expect(dismissals.rows).toEqual([
      { providerEventId: 'other-provider-event', recurrenceScope: 'entire_series' },
    ]);

    const restoredMission = await pool.query<{
      occurrenceId: string;
      title: string;
      completionState: string;
      evidenceState: string;
      rewardIssuance: string;
      storyState: string;
      deletionState: string;
      fieldOwnership: string;
      location: string | null;
      notes: string | null;
    }>(
      `SELECT mo.id AS "occurrenceId",
              ms.title,
              mo.completion_state AS "completionState",
              mo.evidence_state AS "evidenceState",
              mo.reward_issuance AS "rewardIssuance",
              mo.story_state AS "storyState",
              mo.deletion_state AS "deletionState",
              mo.field_ownership AS "fieldOwnership",
              mo.location,
              mo.notes
         FROM external_event_links eel
         JOIN mission_occurrences mo ON mo.id = eel.occurrence_id
         JOIN mission_series ms ON ms.id = mo.series_id
        WHERE eel.connection_id = $1
          AND eel.provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(restoredMission.rows[0]).toEqual({
      occurrenceId: restored.occurrenceId,
      title: 'Current provider title',
      completionState: 'incomplete',
      evidenceState: 'not_submitted',
      rewardIssuance: 'not_issued',
      storyState: 'none',
      deletionState: 'active',
      fieldOwnership: 'organizer_controlled',
      location: 'Admiralty',
      notes: 'Current provider note',
    });

    const originalState = await pool.query<{ deletionState: string }>(
      `SELECT deletion_state AS "deletionState"
         FROM mission_occurrences
        WHERE id = $1`,
      [originalOccurrenceId],
    );
    expect(originalState.rows[0]).toEqual({ deletionState: 'deleted' });
  });
});

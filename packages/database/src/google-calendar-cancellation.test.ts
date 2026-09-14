import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts074_${randomUUID().replaceAll('-', '')}`;
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

async function createAccount(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts074-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('account insert returned no id');
  return id;
}

async function createConnection(accountId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', 'external_to_misyra', 'calendar-1', 'encrypted-test-value', 'connected')
     RETURNING id`,
    [accountId],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('connection insert returned no id');
  return id;
}

function providerEvent(input: {
  providerEventId: string;
  title: string;
  startInstant: string;
  finishInstant: string;
  providerUpdatedAt?: string;
  status?: 'confirmed' | 'cancelled';
}) {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId: input.providerEventId,
    providerUpdatedAt: input.providerUpdatedAt ?? '2026-09-14T10:00:00.000Z',
    title: input.title,
    schedule: {
      type: 'timed' as const,
      startInstant: input.startInstant,
      finishInstant: input.finishInstant,
      timeZone: 'UTC',
      timeBehavior: 'fixed_instant' as const,
    },
    recurrence: null,
    location: null,
    providerNotes: null,
    status: input.status ?? ('confirmed' as const),
    ownership: 'organizer_controlled' as const,
  };
}

async function occurrenceId(connectionId: string, providerEventId: string): Promise<string> {
  const result = await pool.query<{ occurrenceId: string }>(
    `SELECT occurrence_id AS "occurrenceId"
       FROM external_event_links
      WHERE connection_id = $1 AND provider_event_id = $2`,
    [connectionId, providerEventId],
  );
  const id = result.rows[0]?.occurrenceId;
  if (id === undefined) throw new Error(`missing imported occurrence for ${providerEventId}`);
  return id;
}

describe('MTS-074 external cancellation and completed freeze', () => {
  it('applies the future, past, and completed cancellation state matrix without reversing rewards', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-14T12:00:00.000Z'),
    });

    await store.reconcileFullImport(connectionId, {
      events: [
        providerEvent({
          providerEventId: 'future-event',
          title: 'Future invitation',
          startInstant: '2026-09-15T09:00:00.000Z',
          finishInstant: '2026-09-15T10:00:00.000Z',
        }),
        providerEvent({
          providerEventId: 'past-event',
          title: 'Past invitation',
          startInstant: '2026-09-13T09:00:00.000Z',
          finishInstant: '2026-09-13T10:00:00.000Z',
        }),
        providerEvent({
          providerEventId: 'completed-event',
          title: 'Completed invitation',
          startInstant: '2026-09-13T11:00:00.000Z',
          finishInstant: '2026-09-13T12:00:00.000Z',
        }),
      ],
      cursor: 'initial-token',
    });

    const futureId = await occurrenceId(connectionId, 'future-event');
    const pastId = await occurrenceId(connectionId, 'past-event');
    const completedId = await occurrenceId(connectionId, 'completed-event');

    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed', reward_issuance = 'issued'
        WHERE id = $1 AND account_id = $2`,
      [completedId, accountId],
    );
    await pool.query(
      `INSERT INTO mission_completions
        (account_id, occurrence_id, completion_type, action_time)
       VALUES ($1, $2, 'verified', '2026-09-13T11:30:00.000Z')`,
      [accountId, completedId],
    );
    await pool.query(
      `INSERT INTO reward_ledger
        (account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp)
       VALUES ($1, $2, 20, 5, 25)`,
      [accountId, completedId],
    );

    await store.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'delete',
          providerEventId: 'future-event',
          providerUpdatedAt: '2026-09-14T12:05:00.000Z',
          recurrenceScope: 'this_occurrence',
        },
        {
          type: 'delete',
          providerEventId: 'past-event',
          providerUpdatedAt: '2026-09-14T12:05:00.000Z',
          recurrenceScope: 'this_occurrence',
        },
        {
          type: 'delete',
          providerEventId: 'completed-event',
          providerUpdatedAt: '2026-09-14T12:05:00.000Z',
          recurrenceScope: 'this_occurrence',
        },
      ],
      cursor: 'after-cancellation',
    });

    const states = await pool.query<{
      id: string;
      scheduleState: string;
      completionState: string;
      deletionState: string;
    }>(
      `SELECT id,
              schedule_state AS "scheduleState",
              completion_state AS "completionState",
              deletion_state AS "deletionState"
         FROM mission_occurrences
        WHERE id = ANY($1::uuid[])
        ORDER BY id`,
      [[futureId, pastId, completedId]],
    );
    const byId = new Map(states.rows.map((row) => [row.id, row]));

    expect(byId.get(futureId)).toMatchObject({
      scheduleState: 'scheduled',
      completionState: 'incomplete',
      deletionState: 'deleted',
    });
    expect(byId.get(pastId)).toMatchObject({
      scheduleState: 'cancelled',
      completionState: 'incomplete',
      deletionState: 'active',
    });
    expect(byId.get(completedId)).toMatchObject({
      scheduleState: 'scheduled',
      completionState: 'completed',
      deletionState: 'active',
    });

    await expect(
      pool.query(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = $1 AND occurrence_id = $2`,
        [accountId, futureId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    const futureChange = await pool.query<{ operation: string; payload: unknown }>(
      `SELECT operation, payload
         FROM account_change_log
        WHERE account_id = $1 AND entity_id = $2
        ORDER BY sequence DESC
        LIMIT 1`,
      [accountId, futureId],
    );
    expect(futureChange.rows[0]).toEqual({ operation: 'delete', payload: null });

    const pastChange = await pool.query<{ operation: string; payload: unknown }>(
      `SELECT operation, payload
         FROM account_change_log
        WHERE account_id = $1 AND entity_id = $2
        ORDER BY sequence DESC
        LIMIT 1`,
      [accountId, pastId],
    );
    expect(pastChange.rows[0]).toMatchObject({
      operation: 'upsert',
      payload: { occurrence: { scheduleState: 'cancelled' } },
    });

    const reward = await pool.query<{
      baseXp: number;
      proofBonusXp: number;
      awardedXp: number;
    }>(
      `SELECT base_xp AS "baseXp", proof_bonus_xp AS "proofBonusXp", awarded_xp AS "awardedXp"
         FROM reward_ledger
        WHERE account_id = $1 AND occurrence_id = $2`,
      [accountId, completedId],
    );
    expect(reward.rows[0]).toEqual({ baseXp: 20, proofBonusXp: 5, awardedXp: 25 });
  });

  it('treats a provider upsert with cancelled status as cancellation instead of an ordinary edit', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-14T12:00:00.000Z'),
    });
    await store.reconcileFullImport(connectionId, {
      events: [
        providerEvent({
          providerEventId: 'cancelled-upsert',
          title: 'Original title',
          startInstant: '2026-09-15T13:00:00.000Z',
          finishInstant: '2026-09-15T14:00:00.000Z',
        }),
      ],
      cursor: 'initial-token',
    });
    const id = await occurrenceId(connectionId, 'cancelled-upsert');

    await store.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'upsert',
          event: providerEvent({
            providerEventId: 'cancelled-upsert',
            title: 'Cancelled provider title must not replace history',
            startInstant: '2026-09-15T13:00:00.000Z',
            finishInstant: '2026-09-15T14:00:00.000Z',
            providerUpdatedAt: '2026-09-14T12:10:00.000Z',
            status: 'cancelled',
          }),
        },
      ],
      cursor: 'cancelled-token',
    });

    const state = await pool.query<{ deletionState: string; title: string }>(
      `SELECT mo.deletion_state AS "deletionState", ms.title
         FROM mission_occurrences mo
         JOIN mission_series ms ON ms.id = mo.series_id
        WHERE mo.id = $1 AND mo.account_id = $2`,
      [id, accountId],
    );
    expect(state.rows[0]).toEqual({
      deletionState: 'deleted',
      title: 'Original title',
    });
  });
});

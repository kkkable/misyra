import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts073_scope_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-073 server recurring dismissal scope', () => {
  it('uses the selected occurrence as the authoritative This-and-future boundary', async () => {
    const accountId = randomUUID();
    const deviceId = randomUUID();
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();
    const connectionId = randomUUID();

    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject)
       VALUES ($1, 'google', $2)`,
      [accountId, `mts073-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO devices
        (id, account_id, installation_id, platform, app_version, notification_capability)
       VALUES ($1, $2, $3, 'android', '1.0.0', 'denied')`,
      [deviceId, accountId, `installation-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO mission_series (id, account_id, title, recurrence_rule)
       VALUES ($1, $2, 'Provider recurrence', $3::jsonb)`,
      [
        seriesId,
        accountId,
        JSON.stringify({
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        }),
      ],
    );
    await pool.query(
      `INSERT INTO mission_occurrences (
         id, account_id, series_id, local_date, local_start, local_finish,
         start_instant, finish_instant, time_zone, time_behavior, all_day,
         estimated_effort_minutes, schedule_state, completion_state, evidence_state,
         reward_eligibility, reward_issuance, calendar_source, field_ownership,
         synchronization_state, story_state, deletion_state, version
       ) VALUES (
         $1, $2, $3, DATE '2026-09-20', '2026-09-20T09:00:00', '2026-09-20T09:30:00',
         TIMESTAMPTZ '2026-09-20 01:00:00+00', TIMESTAMPTZ '2026-09-20 01:30:00+00',
         'Asia/Hong_Kong', 'fixed_instant', false, NULL,
         'scheduled', 'incomplete', 'not_submitted', 'undetermined', 'not_issued',
         'external', 'organizer_controlled', 'synced', 'none', 'active', 1
       )`,
      [occurrenceId, accountId, seriesId],
    );
    await pool.query(
      `INSERT INTO external_calendar_connections (
         id, account_id, provider, sync_direction, provider_calendar_id,
         encrypted_refresh_token, connection_state
       ) VALUES ($1, $2, 'google', 'external_to_misyra', 'calendar-1', 'encrypted-token', 'connected')`,
      [connectionId, accountId],
    );
    await pool.query(
      `INSERT INTO external_event_links (
         connection_id, occurrence_id, provider_event_id, recurrence_scope
       ) VALUES ($1, $2, 'provider-series-1', 'event')`,
      [connectionId, occurrenceId],
    );

    const mutationId = randomUUID();
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-13T00:15:00.000Z'));
    await expect(
      store.push(accountId, [
        {
          mutationId,
          accountId,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'delete',
          baseVersion: 1,
          clientOccurredAt: '2026-09-13T00:10:00.000Z',
          payload: { recurrenceScope: 'this_and_future' },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });

    const dismissal = await pool.query<{
      recurrenceScope: string;
      effectiveStart: Date | null;
      effectiveEnd: Date | null;
    }>(
      `SELECT recurrence_scope AS "recurrenceScope",
              effective_start AS "effectiveStart",
              effective_end AS "effectiveEnd"
         FROM hidden_external_events
        WHERE connection_id = $1 AND provider_event_id = 'provider-series-1'`,
      [connectionId],
    );
    expect(dismissal.rows[0]).toEqual({
      recurrenceScope: 'this_and_future',
      effectiveStart: new Date('2026-09-20T01:00:00.000Z'),
      effectiveEnd: null,
    });

    expect(
      (
        await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM outbox_events
            WHERE account_id = $1
              AND event_type = 'external_calendar.event.delete_requested'`,
          [accountId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
    expect(
      (
        await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM external_event_links
            WHERE occurrence_id = $1`,
          [occurrenceId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
  });
});

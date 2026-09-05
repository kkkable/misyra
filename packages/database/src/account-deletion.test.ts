import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccountTransaction } from './account-deletion.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts037_${randomUUID().replaceAll('-', '')}`;
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

type SeededAccount = Readonly<{
  accountId: string;
  connectionId: string;
  feedbackId: string;
  mediaId: string;
  occurrenceId: string;
  providerEventId: string;
}>;

async function seedAccount(): Promise<SeededAccount> {
  const accountId = randomUUID();
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const connectionId = randomUUID();
  const feedbackId = randomUUID();
  const mediaId = randomUUID();
  const providerEventId = `provider-event-${randomUUID()}`;

  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject)
     VALUES ($1, 'google', $2)`,
    [accountId, `subject-${accountId}`],
  );
  await pool.query(
    `INSERT INTO account_sessions
       (id, account_id, family_id, refresh_token_hash, expires_at)
     VALUES
       ($1, $3, $2, $4, $7),
       ($5, $3, $6, $8, $7)`,
    [
      randomUUID(),
      randomUUID(),
      accountId,
      `hash-${randomUUID()}`,
      randomUUID(),
      randomUUID(),
      new Date('2026-10-05T13:00:00.000Z'),
      `hash-${randomUUID()}`,
    ],
  );
  await pool.query(
    `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
     VALUES ($1, 'zh-HK', true, 'Asia/Hong_Kong')`,
    [accountId],
  );
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, 'Delete me')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior
     ) VALUES ($1, $2, $3, '2026-09-05', '09:00', '10:00', $4, $5, 'Asia/Hong_Kong', 'local_time')`,
    [
      occurrenceId,
      accountId,
      seriesId,
      new Date('2026-09-05T01:00:00.000Z'),
      new Date('2026-09-05T02:00:00.000Z'),
    ],
  );
  await pool.query(
    `INSERT INTO reward_ledger
       (id, account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp)
     VALUES ($1, $2, $3, 100, 15, 115)`,
    [randomUUID(), accountId, occurrenceId],
  );
  await pool.query(
    `INSERT INTO external_calendar_connections
       (id, account_id, provider, sync_direction)
     VALUES ($1, $2, 'google', 'external')`,
    [connectionId, accountId],
  );
  await pool.query(
    `INSERT INTO external_event_links
       (id, connection_id, occurrence_id, provider_event_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), connectionId, occurrenceId, providerEventId],
  );
  await pool.query(
    `INSERT INTO media_assets
       (id, account_id, purpose, storage_key)
     VALUES ($1, $2, 'evidence-working', $3)`,
    [mediaId, accountId, `evidence-working/${accountId}/proof.jpg`],
  );
  await pool.query(
    `INSERT INTO feedback_reports
       (id, account_id, email, description, technical_details)
     VALUES ($1, $2, 'kept@example.test', 'Keep this submitted report', $3)`,
    [feedbackId, accountId, { appVersion: '1.0.0' }],
  );
  await pool.query(
    `INSERT INTO feedback_media_assets
       (id, feedback_report_id, storage_key)
     VALUES ($1, $2, 'feedback-retained/screenshot.png')`,
    [randomUUID(), feedbackId],
  );
  await pool.query(
    `INSERT INTO idempotency_keys
       (account_id, key, request_hash, response, expires_at)
     VALUES ($1, 'old-command', 'hash', $2, $3)`,
    [accountId, { ok: true }, new Date('2026-09-06T13:00:00.000Z')],
  );
  await pool.query(
    `INSERT INTO outbox_events
       (id, account_id, event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1, $2, 'mission.changed', 'mission', $3, '{}')`,
    [randomUUID(), accountId, occurrenceId],
  );

  return { accountId, connectionId, feedbackId, mediaId, occurrenceId, providerEventId };
}

async function countRows(table: string, accountId: string) {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE account_id = $1`,
    [accountId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

describe('MTS-037 account deletion transaction', () => {
  it('deletes account-owned app data immediately and invalidates every device session', async () => {
    const seeded = await seedAccount();

    await expect(deleteAccountTransaction(pool, seeded.accountId)).resolves.toEqual({
      deleted: true,
    });

    await expect(countRows('accounts', seeded.accountId)).resolves.toBe(0);
    await expect(countRows('account_sessions', seeded.accountId)).resolves.toBe(0);
    await expect(countRows('user_settings', seeded.accountId)).resolves.toBe(0);
    await expect(countRows('mission_occurrences', seeded.accountId)).resolves.toBe(0);
    await expect(countRows('reward_ledger', seeded.accountId)).resolves.toBe(0);
    await expect(countRows('idempotency_keys', seeded.accountId)).resolves.toBe(0);
  });

  it('retains deliberately submitted feedback and feedback media while unlinking the deleted account', async () => {
    const seeded = await seedAccount();

    await deleteAccountTransaction(pool, seeded.accountId);

    const feedback = await pool.query<{
      accountId: string | null;
      email: string | null;
      description: string;
      technicalDetails: unknown;
      mediaCount: string;
    }>(
      `SELECT f.account_id AS "accountId",
              f.email,
              f.description,
              f.technical_details AS "technicalDetails",
              count(m.id)::text AS "mediaCount"
         FROM feedback_reports f
         LEFT JOIN feedback_media_assets m ON m.feedback_report_id = f.id
        WHERE f.id = $1
        GROUP BY f.id`,
      [seeded.feedbackId],
    );

    expect(feedback.rows[0]).toEqual({
      accountId: null,
      email: 'kept@example.test',
      description: 'Keep this submitted report',
      technicalDetails: { appVersion: '1.0.0' },
      mediaCount: '1',
    });
  });

  it('queues only disconnect and product-media deletion work without an external-event delete command', async () => {
    const seeded = await seedAccount();

    await deleteAccountTransaction(pool, seeded.accountId);

    const events = await pool.query<{
      accountId: string | null;
      eventType: string;
      aggregateId: string;
      payload: unknown;
    }>(
      `SELECT account_id AS "accountId",
              event_type AS "eventType",
              aggregate_id AS "aggregateId",
              payload
         FROM outbox_events
        WHERE aggregate_id = ANY($1::uuid[])
        ORDER BY event_type`,
      [[seeded.connectionId, seeded.mediaId]],
    );

    expect(events.rows).toEqual([
      {
        accountId: null,
        eventType: 'account.product_media.delete',
        aggregateId: seeded.mediaId,
        payload: {
          protectedReference: {
            kind: 'media_storage_key',
            id: `evidence-working/${seeded.accountId}/proof.jpg`,
          },
        },
      },
      {
        accountId: null,
        eventType: 'calendar.connection.disconnect',
        aggregateId: seeded.connectionId,
        payload: {
          protectedReference: { kind: 'calendar_connection', id: seeded.connectionId },
        },
      },
    ]);
    expect(JSON.stringify(events.rows)).not.toContain(seeded.providerEventId);
    expect(JSON.stringify(events.rows)).not.toContain('calendar.event.delete');
    await expect(countRows('outbox_events', seeded.accountId)).resolves.toBe(0);
  });

  it('rolls the deletion back if required post-delete cleanup work cannot be recorded', async () => {
    const seeded = await seedAccount();
    await pool.query(`
      CREATE OR REPLACE FUNCTION mts037_fail_media_cleanup_event()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'account.product_media.delete' THEN
          RAISE EXCEPTION 'forced cleanup scheduling failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER mts037_fail_media_cleanup_event
      BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION mts037_fail_media_cleanup_event()
    `);

    await expect(deleteAccountTransaction(pool, seeded.accountId)).rejects.toThrow(
      'forced cleanup scheduling failure',
    );

    await expect(countRows('accounts', seeded.accountId)).resolves.toBe(1);
    await expect(countRows('account_sessions', seeded.accountId)).resolves.toBe(2);
    const feedback = await pool.query<{ accountId: string | null }>(
      `SELECT account_id AS "accountId" FROM feedback_reports WHERE id = $1`,
      [seeded.feedbackId],
    );
    expect(feedback.rows[0]?.accountId).toBe(seeded.accountId);

    await pool.query('DROP TRIGGER mts037_fail_media_cleanup_event ON outbox_events');
    await pool.query('DROP FUNCTION mts037_fail_media_cleanup_event()');
  });
});

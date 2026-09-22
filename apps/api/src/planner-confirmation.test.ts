import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from '@misyra/database';
import { applyMigrations } from '@misyra/database';

import {
  PlannerConfirmationInvalidDraftError,
  confirmPlannerDraft,
} from './planner-confirmation.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts089_${randomUUID().replaceAll('-', '')}`;
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

async function createAccount() {
  const auth = createPostgresAuthStore(pool);
  return auth.findOrCreateAccount('google', `mts089-${randomUUID()}`);
}

async function seedDraft(accountId: string, items: readonly unknown[]) {
  await pool.query(
    `INSERT INTO ai_planner_drafts (id, account_id, status, input_text, image_asset_ids)
     VALUES ($1, $1, 'draft', 'Activate these missions', ARRAY[]::uuid[])`,
    [accountId],
  );
  for (const [ordinal, item] of items.entries()) {
    const id =
      typeof item === 'object' &&
      item !== null &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).id === 'string'
        ? ((item as Record<string, unknown>).id as string)
        : randomUUID();
    await pool.query(
      `INSERT INTO ai_planner_items (id, draft_id, ordinal, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [id, accountId, ordinal, JSON.stringify(item)],
    );
  }
}

function timedItem(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    title: 'Focused work',
    localDate: '2026-09-24',
    startLocalTime: '10:00',
    endLocalTime: '11:00',
    allDay: false,
    estimatedMinutes: 60,
    timeZone: 'Asia/Hong_Kong',
    location: 'Home',
    notes: 'Planner note',
    ...overrides,
  };
}

function allDayItem() {
  return {
    id: randomUUID(),
    title: 'Admin',
    localDate: '2026-09-23',
    allDay: true,
    estimatedMinutes: 45,
    timeZone: 'Asia/Hong_Kong',
  };
}

describe('MTS-089 atomic Planner confirmation', () => {
  it('activates the full draft, queues downstream work, publishes sync changes, and clears the draft', async () => {
    const account = await createAccount();
    await seedDraft(account.id, [timedItem(), allDayItem()]);

    const result = await confirmPlannerDraft(pool, {
      accountId: account.id,
      idempotencyKey: randomUUID(),
      now: new Date('2026-09-22T08:00:00.000Z'),
    });

    expect(result).toMatchObject({ missionCount: 2, calendarDate: '2026-09-23' });
    expect(result.occurrenceIds).toHaveLength(2);

    const series = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM mission_series WHERE account_id = $1',
      [account.id],
    );
    const occurrences = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM mission_occurrences WHERE account_id = $1',
      [account.id],
    );
    const draft = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM ai_planner_drafts WHERE account_id = $1',
      [account.id],
    );
    const changes = await pool.query<{ entityType: string; operation: string }>(
      `SELECT entity_type AS "entityType", operation
         FROM account_change_log
        WHERE account_id = $1
        ORDER BY sequence`,
      [account.id],
    );
    const outbox = await pool.query<{ eventType: string }>(
      `SELECT event_type AS "eventType"
         FROM outbox_events
        WHERE account_id = $1
        ORDER BY created_at, id`,
      [account.id],
    );

    expect(series.rows[0]?.count).toBe(2);
    expect(occurrences.rows[0]?.count).toBe(2);
    expect(draft.rows[0]?.count).toBe(0);
    expect(changes.rows).toEqual([
      { entityType: 'mission', operation: 'upsert' },
      { entityType: 'mission', operation: 'upsert' },
      { entityType: 'planner', operation: 'delete' },
    ]);
    expect(outbox.rows).toEqual([
      { eventType: 'mission.activated' },
      { eventType: 'mission.activated' },
    ]);
  });

  it('rolls back every activation side effect when any draft item is invalid', async () => {
    const account = await createAccount();
    await seedDraft(account.id, [
      timedItem(),
      timedItem({
        id: randomUUID(),
        title: 'Broken second item',
        startLocalTime: '12:00',
        endLocalTime: '11:00',
      }),
    ]);

    await expect(
      confirmPlannerDraft(pool, {
        accountId: account.id,
        idempotencyKey: randomUUID(),
        now: new Date('2026-09-22T08:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(PlannerConfirmationInvalidDraftError);

    for (const table of ['mission_series', 'mission_occurrences', 'outbox_events', 'account_change_log']) {
      const count = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE account_id = $1`,
        [account.id],
      );
      expect(count.rows[0]?.count).toBe(0);
    }
    const draft = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM ai_planner_drafts WHERE account_id = $1',
      [account.id],
    );
    expect(draft.rows[0]?.count).toBe(1);
  });
});

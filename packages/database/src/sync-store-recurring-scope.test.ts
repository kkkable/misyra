import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_recurring_scope_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;
let pool: Pool;

const originalRecurrence = {
  pattern: { type: 'daily', interval: 1 },
  end: { type: 'never' },
} as const;
const truncatedRecurrence = {
  pattern: { type: 'daily', interval: 1 },
  end: { type: 'date', inclusiveLocalDate: '2026-09-08' },
} as const;

function schedule(localDate: string, hour = 9) {
  const localHour = String(hour).padStart(2, '0');
  const finishHour = String(hour).padStart(2, '0');
  const utcHour = String(hour - 9).padStart(2, '0');
  const finishUtcMinute = '30';
  return {
    localStart: `${localDate}T${localHour}:00:00`,
    localFinish: `${localDate}T${finishHour}:30:00`,
    startInstant: `${localDate}T${utcHour}:00:00.000Z`,
    finishInstant: `${localDate}T${utcHour}:${finishUtcMinute}:00.000Z`,
    timeZone: 'Asia/Tokyo',
    timeBehavior: 'local_time',
    allDay: false,
    estimatedEffortMinutes: null,
  } as const;
}

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

describe('MTS-051/MTS-052 recurring mission synchronization', () => {
  it('accepts recurring create and synchronizes a This-and-future series split', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `recurring-scope-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const sourceSeriesId = randomUUID();
    const selectedId = randomUUID();
    const futureId = randomUUID();
    const targetSeriesId = randomUUID();
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-08T12:00:01.000Z'));

    const createPayload = {
      series: {
        id: sourceSeriesId,
        title: 'Daily review',
        recurrence: originalRecurrence,
      },
      occurrence: {
        id: selectedId,
        seriesId: sourceSeriesId,
        schedule: schedule('2026-09-09'),
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
    } as const;

    await expect(
      store.push(account.id, [
        {
          mutationId: randomUUID(),
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: selectedId,
          operation: 'create',
          baseVersion: null,
          clientOccurredAt: '2026-09-08T12:00:00.000Z',
          payload: createPayload,
        },
      ]),
    ).resolves.toMatchObject({ acceptedMutationIds: [expect.any(String)] });

    await expect(
      pool.query('SELECT recurrence_rule FROM mission_series WHERE id = $1 AND account_id = $2', [
        sourceSeriesId,
        account.id,
      ]),
    ).resolves.toMatchObject({ rows: [{ recurrence_rule: originalRecurrence }] });

    await pool.query(
      `INSERT INTO mission_occurrences (
         id, account_id, series_id, local_date, local_start, local_finish,
         start_instant, finish_instant, time_zone, time_behavior, all_day,
         estimated_effort_minutes, schedule_state, completion_state, evidence_state,
         reward_eligibility, reward_issuance, calendar_source, field_ownership,
         synchronization_state, story_state, deletion_state, version
       ) VALUES (
         $1, $2, $3, '2026-09-11', '2026-09-11T09:00:00', '2026-09-11T09:30:00',
         '2026-09-11T00:00:00.000Z', '2026-09-11T00:30:00.000Z', 'Asia/Tokyo', 'local_time', false,
         NULL, 'scheduled', 'incomplete', 'not_submitted',
         'eligible', 'not_issued', 'internal', 'app_owned',
         'synced', 'none', 'active', 1
       )`,
      [futureId, account.id, sourceSeriesId],
    );

    const selectedUpdateId = randomUUID();
    const futureUpdateId = randomUUID();
    await expect(
      store.push(account.id, [
        {
          mutationId: selectedUpdateId,
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: selectedId,
          operation: 'update',
          baseVersion: 1,
          clientOccurredAt: '2026-09-08T12:00:00.000Z',
          payload: {
            schedule: schedule('2026-09-09', 10),
            rewardEligibility: 'eligible',
            series: {
              id: targetSeriesId,
              title: 'Daily review',
              recurrence: originalRecurrence,
            },
            sourceSeries: {
              id: sourceSeriesId,
              recurrence: truncatedRecurrence,
            },
          },
        },
        {
          mutationId: futureUpdateId,
          accountId: account.id,
          deviceId,
          entityType: 'mission',
          entityId: futureId,
          operation: 'update',
          baseVersion: 1,
          clientOccurredAt: '2026-09-08T12:00:00.000Z',
          payload: {
            schedule: schedule('2026-09-11', 10),
            rewardEligibility: 'eligible',
            series: {
              id: targetSeriesId,
              title: 'Daily review',
              recurrence: originalRecurrence,
            },
          },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [selectedUpdateId, futureUpdateId] });

    const series = await pool.query<{
      id: string;
      recurrence_rule: unknown;
    }>(
      `SELECT id, recurrence_rule
         FROM mission_series
        WHERE account_id = $1 AND id IN ($2, $3)
        ORDER BY id`,
      [account.id, sourceSeriesId, targetSeriesId],
    );
    const seriesById = new Map(series.rows.map((row) => [row.id, row.recurrence_rule]));
    expect(seriesById.get(sourceSeriesId)).toEqual(truncatedRecurrence);
    expect(seriesById.get(targetSeriesId)).toEqual(originalRecurrence);

    const occurrences = await pool.query<{
      id: string;
      series_id: string;
      local_start: string;
      completion_state: string;
      evidence_state: string;
      story_state: string;
    }>(
      `SELECT id, series_id, local_start, completion_state, evidence_state, story_state
         FROM mission_occurrences
        WHERE account_id = $1 AND id IN ($2, $3)
        ORDER BY id`,
      [account.id, selectedId, futureId],
    );
    for (const row of occurrences.rows) {
      expect(row.series_id).toBe(targetSeriesId);
      expect(row.local_start).toContain('T10:00:00');
      expect(row.completion_state).toBe('incomplete');
      expect(row.evidence_state).toBe('not_submitted');
      expect(row.story_state).toBe('none');
    }

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') throw new Error('expected incremental sync page');
    const splitChanges = pulled.changes.filter(
      (change) => change.entityId === selectedId || change.entityId === futureId,
    );
    expect(splitChanges.at(-2)?.payload).toMatchObject({
      series: { id: targetSeriesId, recurrence: originalRecurrence },
      occurrence: { id: selectedId, seriesId: targetSeriesId },
    });
    expect(splitChanges.at(-1)?.payload).toMatchObject({
      series: { id: targetSeriesId, recurrence: originalRecurrence },
      occurrence: { id: futureId, seriesId: targetSeriesId },
    });
  });
});

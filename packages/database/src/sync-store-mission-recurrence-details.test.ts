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
const databaseName = `misyra_recurrence_details_${randomUUID().replaceAll('-', '')}`;
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

function timedSchedule(localDate: string, hour: number) {
  const startHour = String(hour).padStart(2, '0');
  const finishHour = String(hour).padStart(2, '0');
  return {
    localStart: `${localDate}T${startHour}:00:00`,
    localFinish: `${localDate}T${finishHour}:30:00`,
    startInstant: `${localDate}T${startHour}:00:00.000Z`,
    finishInstant: `${localDate}T${finishHour}:30:00.000Z`,
    timeZone: 'UTC',
    timeBehavior: 'local_time',
    allDay: false,
    estimatedEffortMinutes: null,
  } as const;
}

function createPayload(
  seriesId: string,
  occurrenceId: string,
  localDate: string,
  recurrence: unknown,
) {
  return {
    series: { id: seriesId, title: 'Recurring mission', recurrence },
    occurrence: {
      id: occurrenceId,
      seriesId,
      schedule: timedSchedule(localDate, 9),
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
    location: 'Central',
    notes: 'General note',
  };
}

describe('MTS-044–051 recurring and Mission Details synchronization', () => {
  it('creates multiple permanent occurrences under one recurring series and persists its rule', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `recurrence-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-06T08:00:00.000Z'));
    const seriesId = randomUUID();
    const firstOccurrenceId = randomUUID();
    const secondOccurrenceId = randomUUID();
    const recurrence = {
      pattern: { type: 'weekly', interval: 1, weekdays: [1], weekStartsOn: 1 },
      end: { type: 'count', occurrenceCount: 2 },
    };

    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: firstOccurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-06T08:00:00.000Z',
        payload: createPayload(seriesId, firstOccurrenceId, '2026-09-07', recurrence),
      },
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: secondOccurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-06T08:00:00.000Z',
        payload: createPayload(seriesId, secondOccurrenceId, '2026-09-14', recurrence),
      },
    ]);

    const series = await pool.query(
      `SELECT title, recurrence_rule
         FROM mission_series
        WHERE id = $1 AND account_id = $2`,
      [seriesId, account.id],
    );
    expect(series.rowCount).toBe(1);
    expect(series.rows[0]).toMatchObject({
      title: 'Recurring mission',
      recurrence_rule: recurrence,
    });

    const occurrences = await pool.query(
      `SELECT id, series_id
         FROM mission_occurrences
        WHERE account_id = $1 AND series_id = $2
        ORDER BY local_date`,
      [account.id, seriesId],
    );
    expect(occurrences.rows).toEqual([
      expect.objectContaining({ id: firstOccurrenceId, series_id: seriesId }),
      expect.objectContaining({ id: secondOccurrenceId, series_id: seriesId }),
    ]);
  });

  it('persists Mission Details title, structured schedule, location and general notes through server sync', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `details-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: `installation-${randomUUID()}`,
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-07T08:00:00.000Z'));
    const seriesId = randomUUID();
    const occurrenceId = randomUUID();

    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: '2026-09-07T08:00:00.000Z',
        payload: createPayload(seriesId, occurrenceId, '2026-09-08', null),
      },
    ]);

    const updatedSchedule = timedSchedule('2026-09-09', 11);
    await store.push(account.id, [
      {
        mutationId: randomUUID(),
        accountId: account.id,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'update',
        baseVersion: 1,
        clientOccurredAt: '2026-09-07T08:05:00.000Z',
        payload: {
          kind: 'details',
          title: 'Updated mission',
          schedule: updatedSchedule,
          rewardEligibility: 'eligible',
          location: 'Kowloon',
          notes: 'Updated general note',
        },
      },
    ]);

    const stored = await pool.query(
      `SELECT s.title, o.local_date, o.local_start, o.local_finish,
              o.location, o.notes, o.reward_eligibility, o.version
         FROM mission_occurrences o
         JOIN mission_series s ON s.id = o.series_id AND s.account_id = o.account_id
        WHERE o.id = $1 AND o.account_id = $2`,
      [occurrenceId, account.id],
    );
    expect(stored.rows[0]).toMatchObject({
      title: 'Updated mission',
      local_date: new Date('2026-09-09T00:00:00.000Z'),
      local_start: '2026-09-09T11:00:00',
      local_finish: '2026-09-09T11:30:00',
      location: 'Kowloon',
      notes: 'Updated general note',
      reward_eligibility: 'eligible',
      version: 2,
    });

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled.kind).toBe('incremental');
    if (pulled.kind !== 'incremental') throw new Error('expected incremental sync page');
    expect(pulled.changes.at(-1)).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      payload: {
        version: 2,
        series: { id: seriesId, title: 'Updated mission', recurrence: null },
        occurrence: { id: occurrenceId, schedule: updatedSchedule },
        location: 'Kowloon',
        notes: 'Updated general note',
      },
    });
  });
});

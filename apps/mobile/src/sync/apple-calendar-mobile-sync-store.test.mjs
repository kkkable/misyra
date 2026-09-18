import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createAppleCalendarSqliteSyncStore } from './apple-calendar-mobile-sync.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { createMutationQueue } from '../storage/mutation-queue.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const seriesId = '55555555-5555-4555-8555-555555555555';
const mutationId = '66666666-6666-4666-8666-666666666666';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async runAsync(sql, ...params) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
  }

  async getFirstAsync(sql, ...params) {
    return this.database.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const databases = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

async function databaseWithAccount() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'Asia/Tokyo')`,
    accountId,
    '2026-09-16T00:00:00.000Z',
  );
  return database;
}

function providerEvent() {
  return {
    title: 'Imported EventKit event',
    schedule: {
      type: 'timed',
      startInstant: '2026-09-16T01:00:00.000Z',
      finishInstant: '2026-09-16T02:00:00.000Z',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'fixed_instant',
    },
    recurrence: null,
    location: 'Tokyo',
    providerNotes: 'Provider notes',
  };
}

function ids(values) {
  const remaining = [...values];
  return () => remaining.shift() ?? crypto.randomUUID();
}

async function seedAppOwnedLinkedMission(database) {
  const series = {
    id: seriesId,
    title: 'App mission',
    recurrence: null,
  };
  const occurrence = {
    id: occurrenceId,
    seriesId,
    schedule: {
      localStart: '2026-09-16T09:00:00',
      localFinish: '2026-09-16T10:00:00',
      startInstant: '2026-09-16T00:00:00.000Z',
      finishInstant: '2026-09-16T01:00:00.000Z',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_required',
    rewardEligibility: 'ineligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  };
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    series.title,
    'Asia/Tokyo',
    JSON.stringify(series),
    '2026-09-16T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, updated_at, server_version)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    '2026-09-16',
    '09:00',
    '10:00',
    JSON.stringify(occurrence),
    '2026-09-16T00:00:00.000Z',
    7,
  );
  await database.runAsync(
    `INSERT INTO search_documents
      (account_id, document_id, occurrence_id, title, location, provider_text,
       personal_note, general_note, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    accountId,
    occurrenceId,
    occurrenceId,
    series.title,
    'Shinjuku',
    'App note',
    '2026-09-16T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO external_links
      (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
     VALUES (?, ?, 'apple', ?, ?, ?)`,
    accountId,
    occurrenceId,
    'apple-app-owned-1',
    JSON.stringify({
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      ownership: 'app_owned',
    }),
    '2026-09-16T00:00:00.000Z',
  );
}

describe('MTS-077 EventKit SQLite/local-mutation harness', () => {
  it('persists the provider link and queues an offline EventKit import through the normal server mutation queue', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: ids([occurrenceId, seriesId, mutationId]),
      now: () => new Date('2026-09-16T00:00:00.000Z'),
    });

    await store.enqueueProviderMutation({
      destination: { kind: 'server' },
      operation: 'create',
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-event-1',
      ownership: 'organizer_controlled',
      event: providerEvent(),
    });

    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      destination: { kind: 'server' },
      mutation: {
        mutationId,
        accountId,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'create',
        baseVersion: null,
        payload: {
          providerLink: {
            connectionId,
            provider: 'apple',
            providerCalendarId: 'apple-calendar-1',
            providerEventId: 'apple-event-1',
            ownership: 'organizer_controlled',
          },
          occurrence: {
            id: occurrenceId,
            seriesId,
            calendarSource: 'external',
            fieldOwnership: 'organizer_controlled',
            synchronizationState: 'pending',
          },
        },
      },
    });

    await expect(store.findLinkByProviderEventId('apple-event-1')).resolves.toMatchObject({
      occurrenceId,
      seriesId,
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      ownership: 'organizer_controlled',
    });
    await expect(store.getMissionSyncState(occurrenceId)).resolves.toMatchObject({
      completionState: 'incomplete',
      calendarSource: 'external',
      serverVersion: null,
    });
    await expect(
      database.getFirstAsync(
        `SELECT provider_text, general_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).resolves.toEqual({
      provider_text: 'Provider notes',
      general_note: null,
    });
  });

  it('preserves an empty provider title in canonical sync data', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: ids([occurrenceId, seriesId, mutationId]),
      now: () => new Date('2026-09-16T00:00:00.000Z'),
    });

    await store.enqueueProviderMutation({
      destination: { kind: 'server' },
      operation: 'create',
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-untitled-1',
      ownership: 'organizer_controlled',
      event: { ...providerEvent(), title: '' },
    });

    const series = await database.getFirstAsync(
      `SELECT title, payload_json
         FROM cached_mission_series
        WHERE account_id = ? AND series_id = ?`,
      accountId,
      seriesId,
    );
    expect(series.title).toBe('');
    expect(JSON.parse(series.payload_json).title).toBe('');

    const pending = await queue.listPending();
    expect(pending[0]?.mutation.payload.series.title).toBe('');
  });

  it('resolves all-day local midnights through the mission IANA zone across DST', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: ids([occurrenceId, seriesId, mutationId]),
      now: () => new Date('2026-10-31T12:00:00.000Z'),
    });

    await store.enqueueProviderMutation({
      destination: { kind: 'server' },
      operation: 'create',
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-all-day-1',
      ownership: 'organizer_controlled',
      event: {
        title: 'DST all-day event',
        schedule: {
          type: 'all_day',
          startLocalDate: '2026-11-01',
          endLocalDateExclusive: '2026-11-02',
          timeZone: 'America/New_York',
        },
        recurrence: null,
        location: null,
        providerNotes: null,
      },
    });

    const cached = await database.getFirstAsync(
      `SELECT payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    const occurrence = JSON.parse(cached.payload_json);
    expect(occurrence.schedule).toMatchObject({
      localStart: '2026-11-01T00:00:00',
      localFinish: '2026-11-02T00:00:00',
      startInstant: '2026-11-01T04:00:00.000Z',
      finishInstant: '2026-11-02T05:00:00.000Z',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
      allDay: true,
      estimatedEffortMinutes: 30,
    });
  });

  it('preserves app-owned mission state when provider writable fields refresh', async () => {
    const database = await databaseWithAccount();
    await seedAppOwnedLinkedMission(database);
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: ids([mutationId]),
      now: () => new Date('2026-09-16T00:05:00.000Z'),
    });

    await store.enqueueProviderMutation({
      destination: { kind: 'server' },
      operation: 'update',
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-app-owned-1',
      ownership: 'app_owned',
      occurrenceId,
      seriesId,
      baseVersion: 7,
      event: {
        ...providerEvent(),
        title: 'Provider-refreshed app mission',
        providerNotes: 'Updated app note',
      },
    });

    const cached = await database.getFirstAsync(
      `SELECT payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(cached.payload_json)).toMatchObject({
      id: occurrenceId,
      seriesId,
      completionState: 'incomplete',
      evidenceState: 'not_required',
      rewardEligibility: 'ineligible',
      rewardIssuance: 'not_issued',
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      storyState: 'none',
      deletionState: 'active',
      synchronizationState: 'pending',
    });
    expect(cached.server_version).toBe(7);
    await expect(
      database.getFirstAsync(
        `SELECT provider_text, general_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).resolves.toEqual({
      provider_text: null,
      general_note: 'Updated app note',
    });
  });

  it('retains the occurrence identifier while refreshing reconnect metadata for the same provider event', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: ids([occurrenceId, seriesId, mutationId]),
      now: () => new Date('2026-09-16T00:00:00.000Z'),
    });

    await store.enqueueProviderMutation({
      destination: { kind: 'server' },
      operation: 'create',
      provider: 'apple',
      connectionId: '77777777-7777-4777-8777-777777777777',
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-event-1',
      ownership: 'organizer_controlled',
      event: providerEvent(),
    });

    await store.relinkProviderEvent({
      occurrenceId,
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-event-1',
      ownership: 'organizer_controlled',
    });

    await expect(store.findLinkByProviderEventId('apple-event-1')).resolves.toMatchObject({
      occurrenceId,
      connectionId,
    });
    const missionCount = await database.getFirstAsync(
      'SELECT COUNT(*) AS count FROM cached_mission_occurrences WHERE account_id = ?',
      accountId,
    );
    expect(Number(missionCount.count)).toBe(1);
  });
});

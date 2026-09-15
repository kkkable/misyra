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

describe('MTS-077 EventKit SQLite/local-mutation harness', () => {
  it('persists the provider link and queues an offline EventKit import through the normal server mutation queue', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: (() => {
        const ids = [occurrenceId, seriesId, mutationId];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
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
  });

  it('retains the occurrence identifier while refreshing reconnect metadata for the same provider event', async () => {
    const database = await databaseWithAccount();
    const queue = createMutationQueue(database, accountId);
    const store = createAppleCalendarSqliteSyncStore({
      database,
      mutationQueue: queue,
      accountId,
      deviceId,
      generateId: (() => {
        const ids = [occurrenceId, seriesId, mutationId];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
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

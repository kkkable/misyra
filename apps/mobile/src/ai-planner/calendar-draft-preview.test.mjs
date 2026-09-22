import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createMutationQueue } from '../storage/mutation-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';
import {
  createPlannerCalendarDraftStore,
  plannerDraftCalendarMaps,
} from './calendar-draft-preview.js';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.beforeNextTransaction = null;
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
      const beforeTransaction = this.beforeNextTransaction;
      this.beforeNextTransaction = null;
      if (beforeTransaction !== null) await beforeTransaction(this);
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
const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function ids() {
  const values = [
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
  ];
  return () => values.shift() ?? '88888888-8888-4888-8888-888888888888';
}

describe('MTS-088 Planner Calendar draft persistence', () => {
  it('preserves newer input while a Calendar draft action is being saved', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-22T06:10:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      accountId,
      JSON.stringify({ text: 'Original input', imageAssetIds: [], items: [] }),
      '2026-09-22T06:10:00.000Z',
    );

    const nextId = ids();
    const store = createPlannerCalendarDraftStore({
      database,
      accountId,
      deviceId,
      generateMutationId: nextId,
      generateItemId: nextId,
      now: () => new Date('2026-09-22T06:11:00.000Z'),
    });

    database.beforeNextTransaction = async (transaction) => {
      await transaction.runAsync(
        'UPDATE planner_drafts SET content_json = ?, updated_at = ? WHERE account_id = ?',
        JSON.stringify({
          text: 'Newest autosaved input',
          imageAssetIds: ['99999999-9999-4999-8999-999999999999'],
          items: [],
        }),
        '2026-09-22T06:10:59.000Z',
        accountId,
      );
    };

    const added = await store.add({
      selectedDate: '2026-09-23',
      title: 'Draft lunch',
      allDay: false,
      startMinute: 720,
      endMinute: 780,
      estimatedEffortMinutes: null,
      rewardEligibility: 'ineligible',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: null,
      notes: null,
    });

    expect(added).toMatchObject({
      text: 'Newest autosaved input',
      imageAssetIds: ['99999999-9999-4999-8999-999999999999'],
      items: [expect.objectContaining({ title: 'Draft lunch' })],
    });
    const row = await database.getFirstAsync(
      'SELECT content_json FROM planner_drafts WHERE account_id = ?',
      accountId,
    );
    expect(JSON.parse(row.content_json)).toEqual(added);
  });

  it('adds, edits, moves/resizes, and deletes draft items without creating active mission side effects', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-22T06:20:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      accountId,
      JSON.stringify({ text: 'Plan my day', imageAssetIds: [], items: [] }),
      '2026-09-22T06:20:00.000Z',
    );

    const nextId = ids();
    let tick = 0;
    const store = createPlannerCalendarDraftStore({
      database,
      accountId,
      deviceId,
      generateMutationId: nextId,
      generateItemId: nextId,
      now: () => new Date(`2026-09-22T06:20:0${String(++tick)}.000Z`),
    });

    const added = await store.add({
      selectedDate: '2026-09-23',
      title: 'Draft lunch',
      allDay: false,
      startMinute: 720,
      endMinute: 780,
      estimatedEffortMinutes: null,
      rewardEligibility: 'eligible',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: 'Central',
      notes: 'Meet Alex',
    });
    expect(added.items).toHaveLength(1);
    const itemId = added.items[0].id;

    await store.adjust({
      missionId: itemId,
      startMinute: 735,
      endMinute: 810,
      rewardEligibility: 'eligible',
      source: 'move',
    });
    const edited = await store.update(itemId, {
      selectedDate: '2026-09-23',
      title: 'Draft lunch updated',
      allDay: false,
      startMinute: 735,
      endMinute: 810,
      estimatedEffortMinutes: null,
      rewardEligibility: 'eligible',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: 'Admiralty',
      notes: null,
    });
    expect(edited.items[0]).toMatchObject({
      id: itemId,
      title: 'Draft lunch updated',
      localDate: '2026-09-23',
      startLocalTime: '12:15',
      endLocalTime: '13:30',
      location: 'Admiralty',
    });

    const maps = plannerDraftCalendarMaps(edited);
    expect(maps.timed['2026-09-23'][0]).toMatchObject({
      id: itemId,
      previewKind: 'planner_draft',
      startMinute: 735,
      endMinute: 810,
    });

    const countsBeforeDelete = {
      series: await database.getFirstAsync('SELECT COUNT(*) AS count FROM cached_mission_series'),
      occurrences: await database.getFirstAsync(
        'SELECT COUNT(*) AS count FROM cached_mission_occurrences',
      ),
      notifications: await database.getFirstAsync(
        'SELECT COUNT(*) AS count FROM notification_registry',
      ),
      externalLinks: await database.getFirstAsync('SELECT COUNT(*) AS count FROM external_links'),
    };
    expect(countsBeforeDelete).toEqual({
      series: { count: 0 },
      occurrences: { count: 0 },
      notifications: { count: 0 },
      externalLinks: { count: 0 },
    });

    const pending = await createMutationQueue(database, accountId).listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.entityType).toBe('planner');
    expect(pending[0].mutation.payload).toMatchObject({
      text: 'Plan my day',
      imageAssetIds: [],
      items: [expect.objectContaining({ id: itemId, title: 'Draft lunch updated' })],
    });

    const removed = await store.remove(itemId);
    expect(removed.items).toEqual([]);
    expect(
      await database.getFirstAsync('SELECT COUNT(*) AS count FROM cached_mission_occurrences'),
    ).toEqual({ count: 0 });
  });

  it('clears the confirmed Planner draft and its obsolete pending Planner mutation locally', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-22T08:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      accountId,
      JSON.stringify({
        text: 'Confirm me',
        imageAssetIds: [],
        items: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            title: 'Confirmed mission',
            localDate: '2026-09-23',
            startLocalTime: '09:00',
            endLocalTime: '09:30',
            allDay: false,
            estimatedMinutes: 30,
            timeZone: 'Asia/Hong_Kong',
          },
        ],
      }),
      '2026-09-22T08:00:00.000Z',
    );

    const nextId = ids();
    const store = createPlannerCalendarDraftStore({
      database,
      accountId,
      deviceId,
      generateMutationId: nextId,
      generateItemId: nextId,
      now: () => new Date('2026-09-22T08:01:00.000Z'),
    });
    await store.update('99999999-9999-4999-8999-999999999999', {
      selectedDate: '2026-09-23',
      title: 'Confirmed mission',
      allDay: false,
      startMinute: 540,
      endMinute: 570,
      estimatedEffortMinutes: null,
      rewardEligibility: 'eligible',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: null,
      notes: null,
    });
    expect(await createMutationQueue(database, accountId).listPending()).toHaveLength(1);

    await store.clearAfterConfirmation();

    expect(await store.load()).toBeNull();
    expect(await createMutationQueue(database, accountId).listPending()).toEqual([]);
  });
});

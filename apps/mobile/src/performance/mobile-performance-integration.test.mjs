import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

import { describe, expect, it, vi } from 'vitest';

import { createLocalRepositories } from '../storage/local-repositories.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { createStoryExportController } from '../story/story-export.js';
import {
  MOBILE_PERFORMANCE_BUDGETS,
  createMobilePerformanceRecorder,
  summarizePerformanceSamples,
} from './mobile-performance.js';

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

const accountId = 'performance-account';
const seriesId = '11111111-1111-4111-8111-111111111111';
const localDate = '2026-09-30';

function occurrenceId(index) {
  return `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`;
}

function minuteText(minute) {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(rest).padStart(2, '0')}:00`;
}

function occurrencePayload(index) {
  const startMinute = 7 * 60 + index * 15;
  const endMinute = Math.min(startMinute + 30, 23 * 60 + 59);
  const id = occurrenceId(index);
  return {
    id,
    seriesId,
    schedule: {
      localStart: `${localDate}T${minuteText(startMinute)}`,
      localFinish: `${localDate}T${minuteText(endMinute)}`,
      startInstant: '2026-09-29T23:00:00.000Z',
      finishInstant: '2026-09-29T23:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  };
}

async function createOrdinaryCalendarDatabase(count = 48) {
  const database = new NodeSqliteAdapter();
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-30T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    'Performance day',
    'Asia/Hong_Kong',
    JSON.stringify({ id: seriesId, title: 'Performance day', recurrence: null }),
    '2026-09-30T00:00:00.000Z',
  );
  for (let index = 0; index < count; index += 1) {
    const payload = occurrencePayload(index);
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      accountId,
      payload.id,
      seriesId,
      localDate,
      payload.schedule.localStart,
      payload.schedule.localFinish,
      JSON.stringify(payload),
      '2026-09-30T00:00:00.000Z',
    );
  }
  return database;
}

const storyInput = {
  imageVersionId: 'source-version',
  sourceImage: {
    id: 'source-version',
    uri: 'file:///story/source.jpg',
    width: 1080,
    height: 1920,
  },
  composition: {
    canvas: { width: 1080, height: 1920 },
    background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
    headline: null,
    supportingText: null,
    effects: [],
    revision: 1,
    savedAt: '2026-09-30T12:38:18.000Z',
  },
};

describe('MTS-112 measured performance integration', () => {
  it('keeps a warm cached-day query below the approved 50 ms smoke threshold', async () => {
    const database = await createOrdinaryCalendarDatabase();
    try {
      const repositories = createLocalRepositories(database, accountId);
      const window = { startLocalDate: localDate, endLocalDate: localDate };
      await repositories.calendar.listWindow(window);

      const samples = [];
      for (let run = 0; run < 20; run += 1) {
        const startedAt = performance.now();
        const missions = await repositories.calendar.listWindow(window);
        samples.push(performance.now() - startedAt);
        expect(missions).toHaveLength(48);
      }

      const summary = summarizePerformanceSamples(samples);
      expect(summary.p95Ms).toBeLessThan(MOBILE_PERFORMANCE_BUDGETS.cachedDayQueryMs);
    } finally {
      database.close();
    }
  });

  it('records cached-day query time at the repository boundary', async () => {
    const database = await createOrdinaryCalendarDatabase(4);
    const recorder = createMobilePerformanceRecorder();
    try {
      const repositories = createLocalRepositories(database, accountId, {
        performanceRecorder: recorder,
      });

      await repositories.calendar.listWindow({
        startLocalDate: localDate,
        endLocalDate: localDate,
      });

      expect(recorder.snapshot().cachedDayQuery).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('records native Story rendering against the five-second export budget', async () => {
    const readings = [1_000, 1_250];
    const recorder = createMobilePerformanceRecorder({
      now: () => readings.shift() ?? 1_250,
    });
    const platform = {
      renderPng: vi.fn(async (input) => ({
        uri: 'file:///story/export.png',
        width: 1080,
        height: 1920,
        imageVersionId: input.imageVersionId,
      })),
      requestSavePermission: vi.fn(async () => true),
      saveToPhotos: vi.fn(async () => undefined),
      share: vi.fn(async () => undefined),
    };
    const controller = createStoryExportController(platform, {
      performanceRecorder: recorder,
    });

    await controller.share(storyInput);

    expect(recorder.snapshot().storyExport).toEqual([250]);
    expect(recorder.snapshot().storyExport[0]).toBeLessThan(
      MOBILE_PERFORMANCE_BUDGETS.storyExportMs,
    );
  });
});

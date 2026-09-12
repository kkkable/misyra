import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const notificationApi = vi.hoisted(() => ({
  scheduleNotificationAsync: vi.fn(async () => 'native-notification-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-notifications', () => ({
  ...notificationApi,
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import { rootMissionNotificationScheduler } from './expo-mission-notifications.js';

const appConfigPath = fileURLToPath(new URL('../../app.config.ts', import.meta.url));
const settingsPath = fileURLToPath(new URL('../settings/settings-route.tsx', import.meta.url));
const deviceScriptUrl = new URL(
  '../../scripts/mts-066-android-notification-device-check.mjs',
  import.meta.url,
);

async function readRequiredFile(path, label) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label} is missing`);
  }
}

describe('MTS-066 Android exact-notification release path', () => {
  it('declares SCHEDULE_EXACT_ALARM and never assumes USE_EXACT_ALARM approval', async () => {
    const appConfig = await readRequiredFile(appConfigPath, 'Expo app config');

    expect(appConfig).toContain('android.permission.SCHEDULE_EXACT_ALARM');
    expect(appConfig).not.toContain('android.permission.USE_EXACT_ALARM');
    expect(appConfig.match(/android\.permission\.SCHEDULE_EXACT_ALARM/g)).toHaveLength(1);
  });

  it('keeps Android scheduling on the SDK 57 DATE trigger path with no extra exact-alarm setting', async () => {
    const settings = await readRequiredFile(settingsPath, 'Settings route');

    await rootMissionNotificationScheduler.schedule({
      occurrenceId: '11111111-1111-4111-8111-111111111111',
      occurrenceIds: ['11111111-1111-4111-8111-111111111111'],
      scheduledAt: '2026-09-14T01:00:00.000Z',
      localDate: '2026-09-14',
      body: 'Mission starts now.',
    });

    expect(notificationApi.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        body: 'Mission starts now.',
        data: {
          localDate: '2026-09-14',
          occurrenceIds: ['11111111-1111-4111-8111-111111111111'],
        },
      },
      trigger: {
        type: 'date',
        date: new Date('2026-09-14T01:00:00.000Z'),
      },
    });
    expect(settings).not.toMatch(/exact.?alarm/i);
  });

  it('provides a manual physical-device recorder for exact and fallback delivery evidence', async () => {
    const module = await import(deviceScriptUrl.href);
    const record = module.buildAndroidNotificationDeliveryRecord({
      device: 'Pixel test device',
      androidApi: 36,
      exactAccess: 'denied',
      scheduledAt: '2026-09-14T01:00:00.000Z',
      observedAt: '2026-09-14T01:00:04.250Z',
      notes: 'best-supported fallback path',
    });

    expect(record).toMatchObject({
      device: 'Pixel test device',
      androidApi: 36,
      exactAccess: 'denied',
      scheduledAt: '2026-09-14T01:00:00.000Z',
      observedAt: '2026-09-14T01:00:04.250Z',
      deliveryDeltaMs: 4250,
      notes: 'best-supported fallback path',
    });
    expect(record.recordedAt).toEqual(expect.any(String));
  });
});

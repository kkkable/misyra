import { describe, expect, it } from 'vitest';

import * as missionNotifications from './mission-notification-catalogs.js';

import type { MissionNotificationLocale } from './mission-notification-catalogs.js';

type CombinedFormatter = (locale: MissionNotificationLocale, count: number) => string;

function isCombinedFormatter(value: unknown): value is CombinedFormatter {
  return typeof value === 'function';
}

function formatCombined(locale: MissionNotificationLocale, count: number): string {
  const value: unknown = Reflect.get(missionNotifications, 'formatMissionCountStartsNow');
  if (!isCombinedFormatter(value)) throw new Error('formatMissionCountStartsNow_missing');
  return value(locale, count);
}

describe('MTS-064 mission notification copy', () => {
  it('keeps the mission title for a single notification, including private missions', () => {
    expect(missionNotifications.formatMissionStartsNow('en', 'Private mission')).toBe(
      'Private mission starts now.',
    );
    expect(missionNotifications.formatMissionStartsNow('zh-HK', '私人任務')).toBe(
      '私人任務 現在開始。',
    );
  });

  it('uses the approved count wording for combined notifications in both launch locales', () => {
    expect(formatCombined('en', 3)).toBe('3 missions start now');
    expect(formatCombined('zh-HK', 3)).toBe('3 個任務現在開始');
  });

  it('rejects counts that cannot represent a combined notification', () => {
    expect(() => formatCombined('en', 1)).toThrow('combined_notification_count');
    expect(() => formatCombined('en', 0)).toThrow('combined_notification_count');
  });
});

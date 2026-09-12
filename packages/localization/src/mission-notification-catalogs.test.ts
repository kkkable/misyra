import { describe, expect, it } from 'vitest';

import { formatMissionCountStartsNow, formatMissionStartsNow } from './mission-notification-catalogs.js';

describe('MTS-064 mission notification copy', () => {
  it('keeps the mission title for a single notification, including private missions', () => {
    expect(formatMissionStartsNow('en', 'Private mission')).toBe('Private mission starts now.');
    expect(formatMissionStartsNow('zh-HK', '私人任務')).toBe('私人任務 現在開始。');
  });

  it('uses the approved count wording for combined notifications in both launch locales', () => {
    expect(formatMissionCountStartsNow('en', 3)).toBe('3 missions start now');
    expect(formatMissionCountStartsNow('zh-HK', 3)).toBe('3 個任務現在開始');
  });

  it('rejects counts that cannot represent a combined notification', () => {
    expect(() => formatMissionCountStartsNow('en', 1)).toThrow('combined_notification_count');
    expect(() => formatMissionCountStartsNow('en', 0)).toThrow('combined_notification_count');
  });
});

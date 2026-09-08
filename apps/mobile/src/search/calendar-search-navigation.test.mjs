import { describe, expect, it, vi } from 'vitest';

import {
  resolveCalendarSearchNavigation,
  visibleCalendarSearchPersonalNoteExcerpt,
} from './calendar-search-navigation.js';

const baseResult = {
  documentId: 'mission-result',
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  title: 'Search result',
  location: null,
  providerText: null,
  personalNoteExcerpt: null,
  localDate: '2026-09-05',
};

function mission({ allDay = false, fieldOwnership = 'app_owned', deletionState = 'active' } = {}) {
  return {
    series: { id: '22222222-2222-4222-8222-222222222222', title: 'Search result' },
    occurrence: {
      id: baseResult.occurrenceId,
      fieldOwnership,
      deletionState,
      schedule: {
        localStart: allDay ? '2026-09-09T00:00:00' : '2026-09-09T10:30:00',
        localFinish: allDay ? '2026-09-10T00:00:00' : '2026-09-09T11:00:00',
        allDay,
      },
    },
  };
}

describe('MTS-049 Calendar search navigation', () => {
  it('re-reads the mission and targets its current original date and timed position', async () => {
    const readMission = vi.fn(() => Promise.resolve(mission()));

    await expect(resolveCalendarSearchNavigation(baseResult, readMission)).resolves.toEqual({
      kind: 'navigate',
      target: {
        date: '2026-09-09',
        minute: 630,
        missionId: baseResult.occurrenceId,
      },
    });
    expect(readMission).toHaveBeenCalledWith(baseResult.occurrenceId);
  });

  it('targets the top of the day for an all-day mission so the highlighted card remains visible', async () => {
    const readMission = vi.fn(() => Promise.resolve(mission({ allDay: true })));

    await expect(resolveCalendarSearchNavigation(baseResult, readMission)).resolves.toEqual({
      kind: 'navigate',
      target: {
        date: '2026-09-09',
        minute: 0,
        missionId: baseResult.occurrenceId,
      },
    });
  });

  it('returns unavailable when a result has no mission or the mission was deleted after results loaded', async () => {
    const readMission = vi.fn(() => Promise.resolve(null));

    await expect(resolveCalendarSearchNavigation(baseResult, readMission)).resolves.toEqual({
      kind: 'unavailable',
    });
    await expect(
      resolveCalendarSearchNavigation({ ...baseResult, occurrenceId: null }, readMission),
    ).resolves.toEqual({ kind: 'unavailable' });
    await expect(
      resolveCalendarSearchNavigation(baseResult, () =>
        Promise.resolve(mission({ deletionState: 'deleted' })),
      ),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('keeps an attributed note excerpt for active app-owned missions and hides it for unavailable missions', () => {
    const attributedResult = { ...baseResult, personalNoteExcerpt: 'allergy follow-up phrase' };

    expect(visibleCalendarSearchPersonalNoteExcerpt(attributedResult, mission())).toBe(
      'allergy follow-up phrase',
    );
    expect(visibleCalendarSearchPersonalNoteExcerpt(attributedResult, null)).toBeNull();
    expect(
      visibleCalendarSearchPersonalNoteExcerpt(
        attributedResult,
        mission({ deletionState: 'deleted' }),
      ),
    ).toBeNull();
  });
});

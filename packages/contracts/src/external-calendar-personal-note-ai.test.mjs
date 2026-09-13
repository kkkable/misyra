import { describe, expect, it } from 'vitest';

import {
  evidenceVerificationMissionContextSchema,
  storyTextMissionContextSchema,
} from './external-calendar.js';

describe('MTS-072 personal-note AI contract', () => {
  it('allows the app-only personal note in Story text context', () => {
    expect(
      storyTextMissionContextSchema.parse({
        missionTitle: 'Organizer meeting',
        providerTaskDetails: 'Organizer agenda',
        scheduleContext: '15 Sep 2026 · 09:00–10:00 Asia/Hong_Kong',
        personalNote: 'Ask privately about access',
      }),
    ).toEqual({
      missionTitle: 'Organizer meeting',
      providerTaskDetails: 'Organizer agenda',
      scheduleContext: '15 Sep 2026 · 09:00–10:00 Asia/Hong_Kong',
      personalNote: 'Ask privately about access',
    });
  });

  it('strictly excludes the personal note from evidence-verification context', () => {
    expect(
      evidenceVerificationMissionContextSchema.parse({
        missionTitle: 'Organizer meeting',
        providerTaskDetails: 'Organizer agenda',
        scheduleContext: '15 Sep 2026 · 09:00–10:00 Asia/Hong_Kong',
      }),
    ).toEqual({
      missionTitle: 'Organizer meeting',
      providerTaskDetails: 'Organizer agenda',
      scheduleContext: '15 Sep 2026 · 09:00–10:00 Asia/Hong_Kong',
    });

    expect(
      evidenceVerificationMissionContextSchema.safeParse({
        missionTitle: 'Organizer meeting',
        providerTaskDetails: 'Organizer agenda',
        scheduleContext: '15 Sep 2026 · 09:00–10:00 Asia/Hong_Kong',
        personalNote: 'must never reach verification',
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  MISSION_FORM_FIELDS,
  missionFormWarning,
  validateMissionForm,
} from './calendar-mission-form.js';

describe('MTS-045 mission form validation', () => {
  it('requires start, end, and time zone for timed missions', () => {
    expect(
      validateMissionForm({
        title: 'Timed mission',
        selectedDate: '2026-09-07',
        allDay: false,
        startMinute: null,
        endMinute: null,
        estimatedEffortMinutes: null,
        timeZone: '',
      }),
    ).toEqual({
      valid: false,
      errors: ['start_required', 'end_required', 'time_zone_required'],
    });

    expect(
      validateMissionForm({
        title: 'Timed mission',
        selectedDate: '2026-09-07',
        allDay: false,
        startMinute: 540,
        endMinute: 570,
        estimatedEffortMinutes: null,
        timeZone: 'Asia/Hong_Kong',
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it('requires a positive effort estimate for all-day missions', () => {
    expect(
      validateMissionForm({
        title: 'All day mission',
        selectedDate: '2026-09-07',
        allDay: true,
        startMinute: null,
        endMinute: null,
        estimatedEffortMinutes: null,
        timeZone: 'Asia/Hong_Kong',
      }),
    ).toEqual({ valid: false, errors: ['effort_required'] });

    expect(
      validateMissionForm({
        title: 'All day mission',
        selectedDate: '2026-09-07',
        allDay: true,
        startMinute: null,
        endMinute: null,
        estimatedEffortMinutes: 30,
        timeZone: 'Asia/Hong_Kong',
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it('returns explicit permanent-zero-XP warnings for past creation and after-start edits', () => {
    expect(
      missionFormWarning({
        mode: 'create',
        startsInPast: true,
        editingAfterStart: false,
      }),
    ).toBe('past_create_zero_xp');
    expect(
      missionFormWarning({
        mode: 'edit',
        startsInPast: false,
        editingAfterStart: true,
      }),
    ).toBe('after_start_zero_xp');
  });

  it('exposes approved form fields without category, attachment, or direct difficulty controls', () => {
    expect(MISSION_FORM_FIELDS).toEqual([
      'title',
      'date',
      'start',
      'end',
      'recurrence',
      'all_day',
      'estimated_effort',
      'time_zone',
      'travel_behavior',
      'private',
      'location',
      'notes',
    ]);
    expect(MISSION_FORM_FIELDS).not.toContain('category');
    expect(MISSION_FORM_FIELDS).not.toContain('attachment');
    expect(MISSION_FORM_FIELDS).not.toContain('difficulty');
  });
});

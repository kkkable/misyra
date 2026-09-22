import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  plannerConfirmationCalendarTarget,
  plannerConfirmationMessage,
  shouldConfirmPlannerDraftReplacement,
} from './ai-planner-confirmation.js';

const firstItem = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Breakfast',
  localDate: '2026-09-24',
  startLocalTime: '08:00',
  endLocalTime: '08:30',
  allDay: false,
  estimatedMinutes: 30,
  timeZone: 'Asia/Hong_Kong',
});
const secondItem = Object.freeze({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Prepare notes',
  localDate: '2026-09-23',
  allDay: true,
  estimatedMinutes: 45,
  timeZone: 'Asia/Hong_Kong',
});

function draft(items = [firstItem, secondItem]) {
  return Object.freeze({
    text: 'Plan my next two days',
    imageAssetIds: Object.freeze([]),
    items: Object.freeze(items),
  });
}

describe('MTS-089 Planner confirmation flow', () => {
  it('requires replacement confirmation only after an extracted schedule exists', () => {
    expect(shouldConfirmPlannerDraftReplacement(draft())).toBe(true);
    expect(shouldConfirmPlannerDraftReplacement(draft([]))).toBe(false);
  });

  it('uses the specified mission-count and consequence copy without exposing Discard Draft', async () => {
    expect(
      plannerConfirmationMessage(
        'Add this schedule to your calendar? This will activate {count} missions, schedule notifications, and sync with your connected calendar.',
        2,
      ),
    ).toBe(
      'Add this schedule to your calendar? This will activate 2 missions, schedule notifications, and sync with your connected calendar.',
    );

    const routeSource = await readFile(
      new URL('./ai-planner-route-screen.tsx', import.meta.url),
      'utf8',
    );
    expect(routeSource).toMatch(/catalog\.confirmScheduleMessage/);
    expect(routeSource).not.toMatch(/Discard Draft/i);
  });

  it('navigates to the earliest relevant Calendar date after confirmation', () => {
    expect(plannerConfirmationCalendarTarget(draft())).toEqual({
      pathname: '/',
      params: { date: '2026-09-23' },
    });
  });
});

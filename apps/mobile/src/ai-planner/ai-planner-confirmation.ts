import type { PlannerCalendarDraftDocument } from './calendar-draft-preview.js';

export type PlannerCalendarNavigationTarget = Readonly<{
  pathname: '/';
  params: Readonly<{ date: string }>;
}>;

export function shouldConfirmPlannerDraftReplacement(
  document: PlannerCalendarDraftDocument,
): boolean {
  return document.items.length > 0;
}

export function plannerConfirmationMessage(missionCount: number): string {
  if (!Number.isSafeInteger(missionCount) || missionCount < 0) {
    throw new RangeError('Planner confirmation mission count must be a non-negative integer.');
  }
  return `Add this schedule to your calendar? This will activate ${String(
    missionCount,
  )} missions, schedule notifications, and sync with your connected calendar.`;
}

export function plannerConfirmationCalendarTarget(
  document: PlannerCalendarDraftDocument,
): PlannerCalendarNavigationTarget {
  const calendarDate = [...document.items]
    .map((item) => item.localDate)
    .sort((left, right) => left.localeCompare(right))[0];
  if (calendarDate === undefined) {
    throw new Error('Planner confirmation requires at least one mission.');
  }
  return Object.freeze({
    pathname: '/',
    params: Object.freeze({ date: calendarDate }),
  });
}

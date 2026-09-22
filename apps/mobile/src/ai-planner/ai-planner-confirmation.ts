import type { PlannerCalendarDraftDocument } from './calendar-draft-preview.js';

export type PlannerCalendarNavigationTarget = Readonly<{
  pathname: '/';
  params: Readonly<{ date: string }>;
}>;

export function shouldConfirmPlannerDraftReplacement(
  document: PlannerCalendarDraftDocument,
): boolean {
  void document;
  throw new Error('MTS-089 replacement confirmation is not implemented.');
}

export function plannerConfirmationMessage(missionCount: number): string {
  void missionCount;
  throw new Error('MTS-089 confirmation copy is not implemented.');
}

export function plannerConfirmationCalendarTarget(
  document: PlannerCalendarDraftDocument,
): PlannerCalendarNavigationTarget {
  void document;
  throw new Error('MTS-089 Calendar navigation is not implemented.');
}

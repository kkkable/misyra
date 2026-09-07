export const MISSION_FORM_FIELDS = [
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
] as const;

export type MissionFormField = (typeof MISSION_FORM_FIELDS)[number];

export type MissionFormValidationError =
  | 'title_required'
  | 'date_required'
  | 'start_required'
  | 'end_required'
  | 'end_after_start_required'
  | 'effort_required'
  | 'time_zone_required';

export type MissionFormWarning = 'past_create_zero_xp' | 'after_start_zero_xp' | null;

export type MissionFormDraft = Readonly<{
  title: string;
  selectedDate: string;
  allDay: boolean;
  startMinute: number | null;
  endMinute: number | null;
  estimatedEffortMinutes: number | null;
  timeZone: string;
}>;

export type MissionFormValidationResult = Readonly<{
  valid: boolean;
  errors: readonly MissionFormValidationError[];
}>;

export function validateMissionForm(draft: MissionFormDraft): MissionFormValidationResult {
  const errors: MissionFormValidationError[] = [];

  if (draft.title.trim().length === 0) errors.push('title_required');
  if (draft.selectedDate.trim().length === 0) errors.push('date_required');

  if (draft.allDay) {
    if (
      draft.estimatedEffortMinutes === null ||
      !Number.isInteger(draft.estimatedEffortMinutes) ||
      draft.estimatedEffortMinutes <= 0
    ) {
      errors.push('effort_required');
    }
  } else {
    if (draft.startMinute === null) errors.push('start_required');
    if (draft.endMinute === null) errors.push('end_required');
    if (
      draft.startMinute !== null &&
      draft.endMinute !== null &&
      draft.endMinute <= draft.startMinute
    ) {
      errors.push('end_after_start_required');
    }
  }

  if (draft.timeZone.trim().length === 0) errors.push('time_zone_required');

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function missionFormWarning({
  mode,
  startsInPast,
  editingAfterStart,
}: Readonly<{
  mode: 'create' | 'edit';
  startsInPast: boolean;
  editingAfterStart: boolean;
}>): MissionFormWarning {
  if (mode === 'edit' && editingAfterStart) return 'after_start_zero_xp';
  if (mode === 'create' && startsInPast) return 'past_create_zero_xp';
  return null;
}

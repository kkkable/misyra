type MissionNotificationNavigationPayload = Readonly<{
  localDate?: unknown;
  occurrenceIds?: unknown;
}>;

export type MissionNotificationNavigation =
  | Readonly<{
      kind: 'mission-details';
      date: string;
      missionId: string;
      occurrenceIds: readonly string[];
    }>
  | Readonly<{
      kind: 'calendar-group';
      date: string;
      occurrenceIds: readonly string[];
    }>;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeOccurrenceIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  if (ids.length !== value.length) return null;
  const normalized = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
  return normalized.length === 0 ? null : Object.freeze(normalized);
}

export function resolveMissionNotificationNavigation(
  payload: MissionNotificationNavigationPayload,
): MissionNotificationNavigation | null {
  if (!isLocalDate(payload.localDate)) return null;
  const occurrenceIds = normalizeOccurrenceIds(payload.occurrenceIds);
  if (occurrenceIds === null) return null;

  if (occurrenceIds.length === 1) {
    const missionId = occurrenceIds[0];
    if (missionId === undefined) return null;
    return Object.freeze({
      kind: 'mission-details',
      date: payload.localDate,
      missionId,
      occurrenceIds,
    });
  }

  return Object.freeze({
    kind: 'calendar-group',
    date: payload.localDate,
    occurrenceIds,
  });
}

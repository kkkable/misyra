import { resolveMissionNotificationNavigation } from './notification-navigation.js';

export type MissionNotificationDestination =
  | Readonly<{
      pathname: '/mission/[id]';
      params: Readonly<{ id: string; date?: string }>;
    }>
  | Readonly<{
      pathname: '/';
      params: Readonly<{ date: string; notificationMissionIds: string }>;
    }>;

type MissionNotificationData = Readonly<{
  localDate?: unknown;
  occurrenceId?: unknown;
  occurrenceIds?: unknown;
}>;

function legacyOccurrenceId(data: MissionNotificationData): string | null {
  if (typeof data.occurrenceId !== 'string') return null;
  const occurrenceId = data.occurrenceId.trim();
  return occurrenceId.length > 0 ? occurrenceId : null;
}

export function handleMissionNotificationData(
  data: MissionNotificationData | undefined,
  navigate: (destination: MissionNotificationDestination) => void,
): boolean {
  if (data === undefined) return false;

  const resolution = resolveMissionNotificationNavigation(data);
  if (resolution === null) {
    const occurrenceId = legacyOccurrenceId(data);
    if (occurrenceId === null) return false;
    navigate({ pathname: '/mission/[id]', params: { id: occurrenceId } });
    return true;
  }

  if (resolution.kind === 'mission-details') {
    navigate({
      pathname: '/mission/[id]',
      params: { id: resolution.missionId, date: resolution.date },
    });
    return true;
  }

  navigate({
    pathname: '/',
    params: {
      date: resolution.date,
      notificationMissionIds: resolution.occurrenceIds.join(','),
    },
  });
  return true;
}

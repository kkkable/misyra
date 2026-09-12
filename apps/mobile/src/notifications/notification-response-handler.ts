import { resolveMissionNotificationNavigation } from './notification-navigation.js';

export type MissionNotificationDestination =
  | Readonly<{
      pathname: '/mission/[id]';
      params: Readonly<{ id: string; date: string }>;
    }>
  | Readonly<{
      pathname: '/';
      params: Readonly<{ date: string; notificationMissionIds: string }>;
    }>;

export function handleMissionNotificationData(
  data: Readonly<{ localDate?: unknown; occurrenceIds?: unknown }> | undefined,
  navigate: (destination: MissionNotificationDestination) => void,
): boolean {
  if (data === undefined) return false;

  const resolution = resolveMissionNotificationNavigation(data);
  if (resolution === null) return false;

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

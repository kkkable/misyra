import type { LocalMission } from '../storage/local-repositories.js';
import type { OfflineSearchResult } from './offline-search.js';

export interface CalendarSearchNavigationTarget {
  readonly date: string;
  readonly minute: number;
  readonly missionId: string;
}

export type CalendarSearchNavigationResolution =
  | Readonly<{ kind: 'navigate'; target: CalendarSearchNavigationTarget }>
  | Readonly<{ kind: 'unavailable' }>;

type MissionReader = (occurrenceId: string) => Promise<LocalMission | null>;

function minuteFromLocalDateTime(value: string): number {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  if (match === null) throw new TypeError('Search target local start must contain a valid time.');
  return Number(match[1]) * 60 + Number(match[2]);
}

export function visibleCalendarSearchPersonalNoteExcerpt(
  result: OfflineSearchResult,
  mission: LocalMission | null,
): string | null {
  if (mission?.occurrence.fieldOwnership !== 'organizer_controlled') return null;
  return result.personalNoteExcerpt;
}

export async function resolveCalendarSearchNavigation(
  result: OfflineSearchResult,
  readMission: MissionReader,
): Promise<CalendarSearchNavigationResolution> {
  if (result.occurrenceId === null) return { kind: 'unavailable' };

  const mission = await readMission(result.occurrenceId);
  if (mission === null || mission.occurrence.deletionState === 'deleted') {
    return { kind: 'unavailable' };
  }

  const schedule = mission.occurrence.schedule;
  return {
    kind: 'navigate',
    target: {
      date: schedule.localStart.slice(0, 10),
      minute: schedule.allDay ? 0 : minuteFromLocalDateTime(schedule.localStart),
      missionId: mission.occurrence.id,
    },
  };
}

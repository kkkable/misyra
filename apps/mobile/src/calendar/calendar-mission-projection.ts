import type { LocalMission } from '../storage/local-repositories.js';
import type { AllDayMissionSummary } from './calendar-all-day.js';
import { resolveMissionCardStatus } from './calendar-completion-style.js';
import type { MissionCardStatus, TimedMissionSummary } from './calendar-mission-layout.js';
import { projectMissionOccurrenceForAppTimeZone } from './calendar-travel-projection.js';

const CALENDAR_WINDOW_DAYS = 730;

export type AllDayMissionsByDate = Readonly<Record<string, readonly AllDayMissionSummary[]>>;
export type TimedMissionsByDate = Readonly<Record<string, readonly TimedMissionSummary[]>>;

function formatLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calendarWindow(
  now: Date,
): Readonly<{ startLocalDate: string; endLocalDate: string }> {
  const center = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  return {
    startLocalDate: formatLocalDate(
      new Date(center.getTime() - CALENDAR_WINDOW_DAYS * dayMilliseconds),
    ),
    endLocalDate: formatLocalDate(
      new Date(center.getTime() + CALENDAR_WINDOW_DAYS * dayMilliseconds),
    ),
  };
}

function minuteFromLocalDateTime(value: string): number {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  if (match === null) throw new Error('Calendar mission local time is invalid.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function missionStatus(mission: LocalMission): MissionCardStatus {
  return resolveMissionCardStatus({
    completionState: mission.occurrence.completionState,
    evidenceState: mission.occurrence.evidenceState,
    completionType: mission.completionType,
  });
}

export function calendarMissionMaps(missions: readonly LocalMission[]): Readonly<{
  allDay: AllDayMissionsByDate;
  timed: TimedMissionsByDate;
}> {
  const allDay: Record<string, AllDayMissionSummary[]> = {};
  const timed: Record<string, TimedMissionSummary[]> = {};

  for (const mission of missions) {
    const occurrence = mission.occurrence;
    const schedule = occurrence.schedule;
    const localDate = schedule.localStart.slice(0, 10);
    const orderKey = schedule.startInstant;

    if (schedule.allDay) {
      const bucket = allDay[localDate] ?? [];
      bucket.push({
        id: occurrence.id,
        title: mission.series.title,
        orderKey,
        completed: occurrence.completionState === 'completed',
        status: missionStatus(mission),
      });
      allDay[localDate] = bucket;
      continue;
    }

    const startMinute = minuteFromLocalDateTime(schedule.localStart);
    const finishDate = schedule.localFinish.slice(0, 10);
    const endMinute =
      finishDate === localDate ? minuteFromLocalDateTime(schedule.localFinish) : 24 * 60;
    if (endMinute <= startMinute) continue;

    const bucket = timed[localDate] ?? [];
    bucket.push({
      id: occurrence.id,
      title: mission.series.title,
      startMinute,
      endMinute,
      orderKey,
      status: missionStatus(mission),
      rewardEligibility: occurrence.rewardEligibility,
      timeZone: schedule.timeZone,
    });
    timed[localDate] = bucket;
  }

  return { allDay, timed };
}

export function projectLocalMissionForAppTimeZone(
  mission: LocalMission,
  appTimeZone: string,
): LocalMission {
  return {
    ...mission,
    occurrence: projectMissionOccurrenceForAppTimeZone(mission.occurrence, appTimeZone),
  };
}

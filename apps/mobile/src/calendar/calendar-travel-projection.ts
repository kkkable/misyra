import { projectScheduleToTimeZone, type MissionOccurrence } from '@misyra/domain';

export function projectMissionOccurrenceForAppTimeZone(
  occurrence: MissionOccurrence,
  appTimeZone: string,
): MissionOccurrence {
  if (occurrence.completionState === 'completed') return occurrence;

  return Object.freeze({
    ...occurrence,
    schedule: projectScheduleToTimeZone({
      schedule: occurrence.schedule,
      destinationTimeZone: appTimeZone,
    }),
  });
}

type CalendarClockPart = 'year' | 'month' | 'day' | 'hour' | 'minute';

function requiredPart(parts: Intl.DateTimeFormatPart[], type: CalendarClockPart): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) throw new Error(`App time-zone formatting omitted ${type}.`);
  return value;
}

export function calendarClockForAppTimeZone(
  now: Date,
  appTimeZone: string,
): Readonly<{ localDate: string; minute: number }> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const year = requiredPart(parts, 'year');
  const month = requiredPart(parts, 'month');
  const day = requiredPart(parts, 'day');
  const hour = Number(requiredPart(parts, 'hour'));
  const minute = Number(requiredPart(parts, 'minute'));

  return {
    localDate: `${year}-${month}-${day}`,
    minute: hour * 60 + minute,
  };
}

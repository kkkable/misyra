import { ExternalCalendarAdapterError } from '@misyra/contracts';

import type {
  HiddenExternalEventRecurrenceScope,
  PostgresGoogleCalendarHiddenEventStore,
} from '@misyra/database';
import { expandRecurrenceDates } from '@misyra/domain';

import type { GoogleCalendarSynchronizationProvider } from './google-calendar-sync.js';

export type HiddenCalendarEventView = Readonly<{
  id: string;
  connectionId: string;
  providerEventId: string;
  recurrenceScope: HiddenExternalEventRecurrenceScope;
  title: string | null;
  schedule: Awaited<
    ReturnType<GoogleCalendarSynchronizationProvider['restoreHiddenEvent']>
  >['schedule'];
  isRecurring: boolean;
}>;

export class GoogleCalendarHiddenEventError extends Error {
  readonly code: 'not_found' | 'provider_error';

  constructor(code: 'not_found' | 'provider_error') {
    super(code);
    this.name = 'GoogleCalendarHiddenEventError';
    this.code = code;
  }
}

type HiddenEventStore = Pick<
  PostgresGoogleCalendarHiddenEventStore,
  'listHiddenEvents' | 'getHiddenEvent' | 'restoreHiddenEventById'
>;

type HiddenEventProvider = Pick<GoogleCalendarSynchronizationProvider, 'restoreHiddenEvent'>;

type GoogleCalendarHiddenEventServiceOptions = Readonly<{
  store: HiddenEventStore;
  provider: HiddenEventProvider;
  now?: () => Date;
}>;

function localDateTimeAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const localDate = `${value('year')}-${value('month')}-${value('day')}`;
  const localTime = `${value('hour')}:${value('minute')}:${value('second')}`;
  return `${localDate}T${localTime}`;
}

function localDateAt(instant: Date, timeZone: string): string {
  return localDateTimeAt(instant, timeZone).slice(0, 10);
}

function localDateEpoch(localDate: string): number {
  const [yearText, monthText, dayText] = localDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('invalid_local_date');
  }
  return Date.UTC(year, month - 1, day);
}

function daysBetweenLocalDates(startLocalDate: string, finishLocalDate: string): number {
  const milliseconds = localDateEpoch(finishLocalDate) - localDateEpoch(startLocalDate);
  return Math.round(milliseconds / 86_400_000);
}

function addLocalDays(localDate: string, days: number): string {
  return new Date(localDateEpoch(localDate) + days * 86_400_000).toISOString().slice(0, 10);
}

function occurrenceHasNotEnded(
  event: Awaited<ReturnType<HiddenEventProvider['restoreHiddenEvent']>>,
  occurrenceLocalDate: string,
  now: Date,
): boolean {
  if (event.schedule.type === 'all_day') {
    const durationDays = daysBetweenLocalDates(
      event.schedule.startLocalDate,
      event.schedule.endLocalDateExclusive,
    );
    const occurrenceEndDate = addLocalDays(occurrenceLocalDate, durationDays);
    const today = localDateAt(now, event.schedule.timeZone);
    return occurrenceEndDate > today;
  }

  const { timeZone } = event.schedule;
  const anchorStart = localDateTimeAt(new Date(event.schedule.startInstant), timeZone);
  const anchorFinish = localDateTimeAt(new Date(event.schedule.finishInstant), timeZone);
  const anchorStartDate = anchorStart.slice(0, 10);
  const anchorFinishDate = anchorFinish.slice(0, 10);
  const finishDateOffset = daysBetweenLocalDates(anchorStartDate, anchorFinishDate);
  const occurrenceFinishDate = addLocalDays(occurrenceLocalDate, finishDateOffset);
  const occurrenceFinishTime = anchorFinish.slice(11);
  const occurrenceFinish = `${occurrenceFinishDate}T${occurrenceFinishTime}`;
  return occurrenceFinish > localDateTimeAt(now, timeZone);
}

function recurringEventHasUpcomingDate(
  event: Awaited<ReturnType<HiddenEventProvider['restoreHiddenEvent']>>,
  now: Date,
): boolean {
  const recurrence = event.recurrence;
  if (recurrence === null) return false;

  const anchorLocalDate =
    event.schedule.type === 'all_day'
      ? event.schedule.startLocalDate
      : localDateAt(new Date(event.schedule.startInstant), event.schedule.timeZone);
  const today = localDateAt(now, event.schedule.timeZone);
  if (today < anchorLocalDate) return true;
  if (recurrence.end.type === 'never') return true;

  const occurrencesThroughToday = expandRecurrenceDates({
    anchorLocalDate,
    recurrence,
    windowStartLocalDate: anchorLocalDate,
    windowEndLocalDate: today,
  });

  if (recurrence.end.type === 'date') {
    if (recurrence.end.inclusiveLocalDate >= today) {
      const startsFromToday = expandRecurrenceDates({
        anchorLocalDate,
        recurrence,
        windowStartLocalDate: today,
        windowEndLocalDate: recurrence.end.inclusiveLocalDate,
      });
      if (startsFromToday.some((localDate) => localDate > today)) return true;
    }
    const latestStart = occurrencesThroughToday.at(-1);
    if (latestStart === undefined) return false;
    return occurrenceHasNotEnded(event, latestStart, now);
  }

  if (occurrencesThroughToday.length < recurrence.end.occurrenceCount) return true;
  const latestStart = occurrencesThroughToday.at(-1);
  if (latestStart === undefined) return false;
  return occurrenceHasNotEnded(event, latestStart, now);
}

function eventIsUpcoming(
  event: Awaited<ReturnType<HiddenEventProvider['restoreHiddenEvent']>>,
  now: Date,
): boolean {
  if (event.recurrence !== null) return recurringEventHasUpcomingDate(event, now);
  if (event.schedule.type === 'timed') {
    return new Date(event.schedule.finishInstant).getTime() > now.getTime();
  }
  return event.schedule.endLocalDateExclusive > localDateAt(now, event.schedule.timeZone);
}

function mapProviderFailure(error: unknown): never {
  if (error instanceof ExternalCalendarAdapterError) {
    if (error.code === 'not_found') throw new GoogleCalendarHiddenEventError('not_found');
    throw new GoogleCalendarHiddenEventError('provider_error');
  }
  throw error;
}

export function createGoogleCalendarHiddenEventService({
  store,
  provider,
  now = () => new Date(),
}: GoogleCalendarHiddenEventServiceOptions) {
  return Object.freeze({
    async listHiddenEvents(accountId: string): Promise<readonly HiddenCalendarEventView[]> {
      const dismissals = await store.listHiddenEvents(accountId);
      const visible: HiddenCalendarEventView[] = [];

      for (const dismissal of dismissals) {
        if (dismissal.provider !== null && dismissal.provider !== 'google') continue;
        try {
          const event = await provider.restoreHiddenEvent({
            connectionId: dismissal.connectionId,
            providerEventId: dismissal.providerEventId,
            recurrenceScope: dismissal.recurrenceScope,
          });
          if (!eventIsUpcoming(event, now())) continue;
          visible.push({
            id: dismissal.id,
            connectionId: dismissal.connectionId,
            providerEventId: dismissal.providerEventId,
            recurrenceScope: dismissal.recurrenceScope,
            title: event.title,
            schedule: event.schedule,
            isRecurring: event.recurrence !== null,
          });
        } catch (error) {
          if (error instanceof ExternalCalendarAdapterError && error.code === 'not_found') {
            continue;
          }
          return mapProviderFailure(error);
        }
      }

      return visible;
    },

    async restoreHiddenEvent(
      accountId: string,
      hiddenEventId: string,
      recurrenceScope: HiddenExternalEventRecurrenceScope,
    ): Promise<Readonly<{ occurrenceId: string }>> {
      const dismissal = await store.getHiddenEvent(accountId, hiddenEventId);
      if (dismissal === null) throw new GoogleCalendarHiddenEventError('not_found');
      try {
        const event = await provider.restoreHiddenEvent({
          connectionId: dismissal.connectionId,
          providerEventId: dismissal.providerEventId,
          recurrenceScope,
        });
        return await store.restoreHiddenEventById(accountId, hiddenEventId, {
          recurrenceScope,
          event,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === 'calendar_hidden_event_not_found' ||
            error.message === 'calendar_hidden_event_not_restorable')
        ) {
          throw new GoogleCalendarHiddenEventError('not_found');
        }
        return mapProviderFailure(error);
      }
    },
  });
}

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

function localDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
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

  if (recurrence.end.type === 'date') {
    if (recurrence.end.inclusiveLocalDate < today) return false;
    return (
      expandRecurrenceDates({
        anchorLocalDate,
        recurrence,
        windowStartLocalDate: today,
        windowEndLocalDate: recurrence.end.inclusiveLocalDate,
      }).length > 0
    );
  }

  const occurrencesThroughToday = expandRecurrenceDates({
    anchorLocalDate,
    recurrence,
    windowStartLocalDate: anchorLocalDate,
    windowEndLocalDate: today,
  });
  if (occurrencesThroughToday.length < recurrence.end.occurrenceCount) return true;
  return occurrencesThroughToday.at(-1) === today;
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

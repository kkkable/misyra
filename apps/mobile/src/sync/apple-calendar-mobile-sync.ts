import {
  DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES,
  resolveLocalDateTimeInstant,
  type MissionOccurrenceInput,
  type MissionSeriesInput,
} from '@misyra/domain';

import type {
  AppleCalendarEventWrite,
  AppleCalendarNativeEvent,
  AppleCalendarNativeModule as AppleCalendarNativeModuleType,
} from '../../modules/apple-calendar/index.js';
import type { MutationQueue, PendingMutation } from '../storage/mutation-queue.js';
import type { MigrationDatabase, SqlBindValue } from '../storage/schema.js';

const FUTURE_SYNC_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

type AppleCalendarConnection = Readonly<{
  id: string;
  provider: 'apple';
  providerCalendarId: string;
  initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
  state: 'connected' | 'permission_revoked' | 'provider_unavailable' | 'disconnected';
}>;

type ProviderWritableEvent = Readonly<{
  title: string;
  schedule:
    | Readonly<{
        type: 'timed';
        startInstant: string;
        finishInstant: string;
        timeZone: string;
        timeBehavior: 'fixed_instant' | 'local_time';
      }>
    | Readonly<{
        type: 'all_day';
        startLocalDate: string;
        endLocalDateExclusive: string;
        timeZone: string;
      }>;
  recurrence: Record<string, unknown> | null;
  location: string | null;
  providerNotes: string | null;
}>;

type ProviderLink = Readonly<{
  occurrenceId: string;
  seriesId: string;
  providerCalendarId: string;
  connectionId: string;
  ownership: 'app_owned' | 'organizer_controlled';
}>;

type MissionSyncState = Readonly<{
  completionState: 'incomplete' | 'completed';
  serverVersion: number | null;
  calendarSource: 'internal' | 'external';
}>;

type ProviderMutationInput = Readonly<{
  destination: Readonly<{ kind: 'server' }>;
  operation: 'create' | 'update';
  provider: 'apple';
  connectionId: string;
  providerCalendarId: string;
  providerEventId: string;
  ownership: 'app_owned' | 'organizer_controlled';
  event: ProviderWritableEvent;
  occurrenceId?: string;
  seriesId?: string;
  baseVersion?: number | null;
}>;

type ProviderRelinkInput = Readonly<{
  occurrenceId: string;
  provider: 'apple';
  connectionId: string;
  providerCalendarId: string;
  providerEventId: string;
  ownership: 'app_owned' | 'organizer_controlled';
}>;

type PendingAppleCommand =
  | Readonly<{
      mutationId: string;
      occurrenceId: string;
      operation: 'create';
      event: ProviderWritableEvent;
    }>
  | Readonly<{
      mutationId: string;
      occurrenceId: string;
      operation: 'update';
      providerEventId: string;
      event: ProviderWritableEvent;
    }>
  | Readonly<{
      mutationId: string;
      occurrenceId: string;
      operation: 'delete';
      providerEventId: string;
    }>;

type SettleAppleCommandInput = Readonly<{
  mutationId: string;
  occurrenceId: string;
  connectionId: string;
  providerCalendarId: string;
  providerEventId: string;
  operation: 'create' | 'update' | 'delete';
}>;

export type AppleCalendarMobileSyncStore = Readonly<{
  findLinkByProviderEventId(providerEventId: string): Promise<ProviderLink | null>;
  getMissionSyncState(occurrenceId: string): Promise<MissionSyncState | null>;
  enqueueProviderMutation(input: ProviderMutationInput): Promise<void>;
  relinkProviderEvent(input: ProviderRelinkInput): Promise<void>;
  listPendingAppleCommands(): Promise<readonly PendingAppleCommand[]>;
  settleAppleCommand(input: SettleAppleCommandInput): Promise<void>;
}>;

type SyncInactiveReason =
  'adapter_unavailable' | 'connection_inactive' | 'permission_denied' | 'background_unavailable';

type SyncRunResult =
  | Readonly<{ status: 'inactive'; reason: SyncInactiveReason }>
  | Readonly<{
      status: 'synchronized';
      providerChangesQueued: number;
      frozenProviderEvents: number;
      commandsApplied: number;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredTimeZone(value: string | null): string {
  if (value === null || value.trim().length === 0) {
    throw new Error('EventKit event is missing its time-zone identity.');
  }
  return value;
}

function localDateTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

function localDate(instant: string, timeZone: string): string {
  return localDateTime(instant, timeZone).slice(0, 10);
}

function normalizedProviderEvent(event: AppleCalendarNativeEvent): ProviderWritableEvent {
  const timeZone = requiredTimeZone(event.timeZone);
  if (event.isAllDay) {
    return {
      title: event.title ?? '',
      schedule: {
        type: 'all_day',
        startLocalDate: localDate(event.startDate, timeZone),
        endLocalDateExclusive: localDate(event.endDate, timeZone),
        timeZone,
      },
      recurrence: event.recurrence,
      location: event.location,
      providerNotes: event.providerNotes,
    };
  }
  return {
    title: event.title ?? '',
    schedule: {
      type: 'timed',
      startInstant: event.startDate,
      finishInstant: event.endDate,
      timeZone,
      timeBehavior: 'fixed_instant',
    },
    recurrence: event.recurrence,
    location: event.location,
    providerNotes: event.providerNotes,
  };
}

function nativeWriteEvent(event: ProviderWritableEvent): AppleCalendarEventWrite {
  return {
    title: event.title,
    schedule: event.schedule,
    recurrence: event.recurrence,
    location: event.location,
    providerNotes: event.providerNotes,
  };
}

export function createAppleCalendarMobileSync({
  accountId: _accountId,
  deviceId: _deviceId,
  connection,
  nativeModule,
  store,
  now = () => new Date(),
}: Readonly<{
  accountId: string;
  deviceId: string;
  connection: AppleCalendarConnection | null;
  nativeModule: AppleCalendarNativeModuleType | null;
  store: AppleCalendarMobileSyncStore;
  now?: () => Date;
  generateId?: () => string;
}>) {
  let runTail: Promise<SyncRunResult> = Promise.resolve({
    status: 'inactive',
    reason: 'adapter_unavailable',
  });

  const execute = async (): Promise<SyncRunResult> => {
    if (nativeModule === null) return { status: 'inactive', reason: 'adapter_unavailable' };
    if (connection === null || connection.state !== 'connected') {
      return { status: 'inactive', reason: 'connection_inactive' };
    }
    const authorization = await nativeModule.getAuthorizationStatus();
    if (authorization !== 'full_access') {
      return { status: 'inactive', reason: 'permission_denied' };
    }

    let commandsApplied = 0;
    const commands = await store.listPendingAppleCommands();
    for (const command of commands) {
      let providerEventId: string;
      if (command.operation === 'create') {
        const created = await nativeModule.createEvent(
          connection.providerCalendarId,
          nativeWriteEvent(command.event),
        );
        providerEventId = created.eventIdentifier;
      } else if (command.operation === 'update') {
        const updated = await nativeModule.updateEvent(
          command.providerEventId,
          nativeWriteEvent(command.event),
        );
        providerEventId = updated.eventIdentifier;
      } else {
        await nativeModule.deleteEvent(command.providerEventId);
        providerEventId = command.providerEventId;
      }
      await store.settleAppleCommand({
        mutationId: command.mutationId,
        occurrenceId: command.occurrenceId,
        connectionId: connection.id,
        providerCalendarId: connection.providerCalendarId,
        providerEventId,
        operation: command.operation,
      });
      commandsApplied += 1;
    }

    const start = now();
    const end = new Date(start.getTime() + FUTURE_SYNC_WINDOW_MS);
    const events = await nativeModule.fetchEvents(
      connection.providerCalendarId,
      start.toISOString(),
      end.toISOString(),
    );
    let providerChangesQueued = 0;
    let frozenProviderEvents = 0;

    for (const event of events) {
      const normalized = normalizedProviderEvent(event);
      const link = await store.findLinkByProviderEventId(event.eventIdentifier);
      if (link === null) {
        await store.enqueueProviderMutation({
          destination: { kind: 'server' },
          operation: 'create',
          provider: 'apple',
          connectionId: connection.id,
          providerCalendarId: connection.providerCalendarId,
          providerEventId: event.eventIdentifier,
          ownership: 'organizer_controlled',
          event: normalized,
        });
        providerChangesQueued += 1;
        continue;
      }

      await store.relinkProviderEvent({
        occurrenceId: link.occurrenceId,
        provider: 'apple',
        connectionId: connection.id,
        providerCalendarId: connection.providerCalendarId,
        providerEventId: event.eventIdentifier,
        ownership: link.ownership,
      });
      const mission = await store.getMissionSyncState(link.occurrenceId);
      if (mission?.completionState === 'completed') {
        frozenProviderEvents += 1;
        continue;
      }
      if (mission === null || mission.serverVersion === null) continue;
      await store.enqueueProviderMutation({
        destination: { kind: 'server' },
        operation: 'update',
        provider: 'apple',
        connectionId: connection.id,
        providerCalendarId: connection.providerCalendarId,
        providerEventId: event.eventIdentifier,
        ownership: link.ownership,
        event: normalized,
        occurrenceId: link.occurrenceId,
        seriesId: link.seriesId,
        baseVersion: mission.serverVersion,
      });
      providerChangesQueued += 1;
    }

    return {
      status: 'synchronized',
      providerChangesQueued,
      frozenProviderEvents,
      commandsApplied,
    };
  };

  const serializedRun = (): Promise<SyncRunResult> => {
    const result = runTail.then(execute, execute);
    runTail = result;
    return result;
  };

  return {
    runForeground: serializedRun,
    async runBestEffortBackground(): Promise<SyncRunResult> {
      try {
        return await serializedRun();
      } catch {
        return { status: 'inactive', reason: 'background_unavailable' };
      }
    },
    subscribeStoreChanges() {
      if (nativeModule === null) {
        return { remove() {} };
      }
      return nativeModule.addListener('onStoreChanged', () => {
        void serializedRun();
      });
    },
  };
}

export interface AppleCalendarSyncDatabase extends MigrationDatabase {
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

type LinkRow = Readonly<{
  occurrence_id: string;
  series_id: string;
  payload_json: string;
}>;

type MissionStateRow = Readonly<{
  payload_json: string;
  server_version: number | null;
}>;

type CachedMissionRow = Readonly<{
  series_payload_json: string;
  occurrence_payload_json: string;
  location: string | null;
  general_note: string | null;
}>;

function linkPayload(input: {
  connectionId: string;
  providerCalendarId: string;
  ownership: 'app_owned' | 'organizer_controlled';
}) {
  return {
    connectionId: input.connectionId,
    providerCalendarId: input.providerCalendarId,
    ownership: input.ownership,
  };
}

function parseLinkPayload(value: string): Readonly<{
  connectionId: string;
  providerCalendarId: string;
  ownership: 'app_owned' | 'organizer_controlled';
}> {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) throw new Error('Apple provider link payload is invalid.');
  if (
    typeof parsed.connectionId !== 'string' ||
    typeof parsed.providerCalendarId !== 'string' ||
    (parsed.ownership !== 'app_owned' && parsed.ownership !== 'organizer_controlled')
  ) {
    throw new Error('Apple provider link payload is invalid.');
  }
  return {
    connectionId: parsed.connectionId,
    providerCalendarId: parsed.providerCalendarId,
    ownership: parsed.ownership,
  };
}

function missionSchedule(event: ProviderWritableEvent): MissionOccurrenceInput['schedule'] {
  if (event.schedule.type === 'timed') {
    return {
      localStart: localDateTime(event.schedule.startInstant, event.schedule.timeZone),
      localFinish: localDateTime(event.schedule.finishInstant, event.schedule.timeZone),
      startInstant: event.schedule.startInstant,
      finishInstant: event.schedule.finishInstant,
      timeZone: event.schedule.timeZone,
      timeBehavior: event.schedule.timeBehavior,
      allDay: false,
      estimatedEffortMinutes: null,
    };
  }
  const localStart = `${event.schedule.startLocalDate}T00:00:00`;
  const localFinish = `${event.schedule.endLocalDateExclusive}T00:00:00`;
  return {
    localStart,
    localFinish,
    startInstant: resolveLocalDateTimeInstant(localStart, event.schedule.timeZone),
    finishInstant: resolveLocalDateTimeInstant(localFinish, event.schedule.timeZone),
    timeZone: event.schedule.timeZone,
    timeBehavior: 'local_time',
    allDay: true,
    estimatedEffortMinutes: DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES,
  };
}

function eventForCachedMission(row: CachedMissionRow): ProviderWritableEvent {
  const series = JSON.parse(row.series_payload_json) as MissionSeriesInput;
  const occurrence = JSON.parse(row.occurrence_payload_json) as MissionOccurrenceInput;
  const schedule = occurrence.schedule.allDay
    ? {
        type: 'all_day' as const,
        startLocalDate: occurrence.schedule.localStart.slice(0, 10),
        endLocalDateExclusive: occurrence.schedule.localFinish.slice(0, 10),
        timeZone: occurrence.schedule.timeZone,
      }
    : {
        type: 'timed' as const,
        startInstant: occurrence.schedule.startInstant,
        finishInstant: occurrence.schedule.finishInstant,
        timeZone: occurrence.schedule.timeZone,
        timeBehavior: occurrence.schedule.timeBehavior,
      };
  return {
    title: series.title,
    schedule,
    recurrence: series.recurrence as Record<string, unknown> | null,
    location: row.location,
    providerNotes: row.general_note,
  };
}

function providerEventIdFromMutation(mutation: PendingMutation): string | null {
  const payload = mutation.mutation.payload;
  if (!isRecord(payload)) return null;
  return typeof payload.providerEventId === 'string' ? payload.providerEventId : null;
}

function missionStateFromRow(row: MissionStateRow): MissionSyncState {
  const occurrence = JSON.parse(row.payload_json) as MissionOccurrenceInput;
  return {
    completionState: occurrence.completionState,
    serverVersion: row.server_version,
    calendarSource: occurrence.calendarSource,
  };
}

function providerTextFields(occurrence: MissionOccurrenceInput, notes: string | null) {
  const organizerControlled =
    occurrence.calendarSource === 'external' &&
    occurrence.fieldOwnership === 'organizer_controlled';
  return {
    providerText: organizerControlled ? notes : null,
    generalNote: organizerControlled ? null : notes,
  };
}

export function createAppleCalendarSqliteSyncStore({
  database,
  mutationQueue,
  accountId,
  deviceId,
  generateId,
  now = () => new Date(),
}: Readonly<{
  database: AppleCalendarSyncDatabase;
  mutationQueue: MutationQueue;
  accountId: string;
  deviceId: string;
  generateId: () => string;
  now?: () => Date;
}>): AppleCalendarMobileSyncStore {
  const findLinkByProviderEventId = async (
    providerEventId: string,
  ): Promise<ProviderLink | null> => {
    const row = await database.getFirstAsync<LinkRow>(
      `SELECT l.occurrence_id, o.series_id, l.payload_json
         FROM external_links l
         JOIN cached_mission_occurrences o
           ON o.account_id = l.account_id
          AND o.occurrence_id = l.occurrence_id
        WHERE l.account_id = ? AND l.provider = 'apple' AND l.external_event_id = ?`,
      accountId,
      providerEventId,
    );
    if (row === null) return null;
    const payload = parseLinkPayload(row.payload_json);
    return {
      occurrenceId: row.occurrence_id,
      seriesId: row.series_id,
      providerCalendarId: payload.providerCalendarId,
      connectionId: payload.connectionId,
      ownership: payload.ownership,
    };
  };

  const getMissionSyncState = async (occurrenceId: string): Promise<MissionSyncState | null> => {
    const row = await database.getFirstAsync<MissionStateRow>(
      `SELECT payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    return row === null ? null : missionStateFromRow(row);
  };

  const relinkProviderEvent = async (input: ProviderRelinkInput): Promise<void> => {
    const payload = JSON.stringify(linkPayload(input));
    const existing = await database.getFirstAsync<{ occurrence_id: string }>(
      `SELECT occurrence_id FROM external_links
        WHERE account_id = ? AND provider = 'apple' AND external_event_id = ?`,
      accountId,
      input.providerEventId,
    );
    if (existing !== null) {
      if (existing.occurrence_id !== input.occurrenceId) {
        throw new Error('Apple provider event is linked to another local occurrence.');
      }
      await database.runAsync(
        `UPDATE external_links
            SET payload_json = ?, updated_at = ?
          WHERE account_id = ? AND provider = 'apple' AND external_event_id = ?`,
        payload,
        now().toISOString(),
        accountId,
        input.providerEventId,
      );
      return;
    }
    await database.runAsync(
      `INSERT INTO external_links
        (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
       VALUES (?, ?, 'apple', ?, ?, ?)`,
      accountId,
      input.occurrenceId,
      input.providerEventId,
      payload,
      now().toISOString(),
    );
  };

  const enqueueProviderMutation = async (input: ProviderMutationInput): Promise<void> => {
    const actionInstant = now().toISOString();
    const occurrenceId = input.occurrenceId ?? generateId();
    const seriesId = input.seriesId ?? generateId();
    const mutationId = generateId();
    const schedule = missionSchedule(input.event);
    const series: MissionSeriesInput = {
      id: seriesId,
      title: input.event.title.trim().length === 0 ? 'Untitled event' : input.event.title,
      recurrence: input.event.recurrence as MissionSeriesInput['recurrence'],
    };
    let occurrence: MissionOccurrenceInput;
    if (input.operation === 'create') {
      occurrence = {
        id: occurrenceId,
        seriesId,
        schedule,
        scheduleState: 'scheduled',
        completionState: 'incomplete',
        evidenceState: 'not_submitted',
        rewardEligibility: 'undetermined',
        rewardIssuance: 'not_issued',
        calendarSource: 'external',
        fieldOwnership: 'organizer_controlled',
        synchronizationState: 'pending',
        storyState: 'none',
        deletionState: 'active',
      };
    } else {
      const currentRow = await database.getFirstAsync<MissionStateRow>(
        `SELECT payload_json, server_version
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (currentRow === null) throw new Error('Apple provider update target is not cached.');
      const current = JSON.parse(currentRow.payload_json) as MissionOccurrenceInput;
      if (current.fieldOwnership !== input.ownership) {
        throw new Error('Apple provider ownership does not match the cached mission.');
      }
      occurrence = {
        ...current,
        seriesId,
        schedule,
        synchronizationState: 'pending',
      };
    }
    const providerLink = {
      connectionId: input.connectionId,
      provider: 'apple' as const,
      providerCalendarId: input.providerCalendarId,
      providerEventId: input.providerEventId,
      ownership: input.ownership,
    };
    const payload =
      input.operation === 'create'
        ? {
            series,
            occurrence,
            location: input.event.location,
            notes: input.event.providerNotes,
            providerLink,
          }
        : {
            kind: 'provider_details',
            series,
            occurrence,
            location: input.event.location,
            notes: input.event.providerNotes,
            providerLink,
          };
    const text = providerTextFields(occurrence, input.event.providerNotes);

    await mutationQueue.enqueue({
      mutation: {
        mutationId,
        accountId,
        deviceId,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: input.operation,
        baseVersion: input.operation === 'create' ? null : (input.baseVersion ?? null),
        clientOccurredAt: actionInstant,
        payload,
      },
      destination: input.destination,
      applyLocal: async (transaction) => {
        if (input.operation === 'create') {
          await transaction.runAsync(
            `INSERT INTO cached_mission_series
              (account_id, series_id, title, timezone, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            accountId,
            seriesId,
            series.title,
            schedule.timeZone,
            JSON.stringify(series),
            actionInstant,
          );
          await transaction.runAsync(
            `INSERT INTO cached_mission_occurrences
              (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
               all_day, payload_json, updated_at, server_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            accountId,
            occurrenceId,
            seriesId,
            schedule.localStart.slice(0, 10),
            schedule.allDay ? null : schedule.localStart.slice(11, 16),
            schedule.allDay ? null : schedule.localFinish.slice(11, 16),
            schedule.allDay ? 1 : 0,
            JSON.stringify(occurrence),
            actionInstant,
          );
          await transaction.runAsync(
            `INSERT INTO search_documents
              (account_id, document_id, occurrence_id, title, location, provider_text,
               personal_note, general_note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            accountId,
            occurrenceId,
            occurrenceId,
            series.title,
            input.event.location,
            text.providerText,
            text.generalNote,
            actionInstant,
          );
        } else {
          await transaction.runAsync(
            `UPDATE cached_mission_series
                SET title = ?, timezone = ?, payload_json = ?, updated_at = ?
              WHERE account_id = ? AND series_id = ?`,
            series.title,
            schedule.timeZone,
            JSON.stringify(series),
            actionInstant,
            accountId,
            seriesId,
          );
          await transaction.runAsync(
            `UPDATE cached_mission_occurrences
                SET local_date = ?, scheduled_start = ?, scheduled_end = ?, all_day = ?,
                    payload_json = ?, updated_at = ?
              WHERE account_id = ? AND occurrence_id = ?`,
            schedule.localStart.slice(0, 10),
            schedule.allDay ? null : schedule.localStart.slice(11, 16),
            schedule.allDay ? null : schedule.localFinish.slice(11, 16),
            schedule.allDay ? 1 : 0,
            JSON.stringify(occurrence),
            actionInstant,
            accountId,
            occurrenceId,
          );
          await transaction.runAsync(
            `UPDATE search_documents
                SET title = ?, location = ?, provider_text = ?, general_note = ?, updated_at = ?
              WHERE account_id = ? AND occurrence_id = ?`,
            series.title,
            input.event.location,
            text.providerText,
            text.generalNote,
            actionInstant,
            accountId,
            occurrenceId,
          );
        }
        await transaction.runAsync(
          `INSERT INTO external_links
            (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
           VALUES (?, ?, 'apple', ?, ?, ?)
           ON CONFLICT(account_id, occurrence_id, provider) DO UPDATE SET
             external_event_id = excluded.external_event_id,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          accountId,
          occurrenceId,
          input.providerEventId,
          JSON.stringify(linkPayload(input)),
          actionInstant,
        );
      },
    });
  };

  const listPendingAppleCommands = async (): Promise<readonly PendingAppleCommand[]> => {
    const pending = (await mutationQueue.listPending()).filter(
      (item) =>
        item.destination.kind === 'external_calendar' && item.destination.provider === 'apple',
    );
    const commands: PendingAppleCommand[] = [];
    for (const item of pending) {
      const occurrenceId = item.mutation.entityId;
      if (item.mutation.operation === 'delete') {
        const link = await database.getFirstAsync<{ external_event_id: string }>(
          `SELECT external_event_id FROM external_links
            WHERE account_id = ? AND occurrence_id = ? AND provider = 'apple'`,
          accountId,
          occurrenceId,
        );
        const providerEventId = link?.external_event_id ?? providerEventIdFromMutation(item);
        if (providerEventId !== null) {
          commands.push({
            mutationId: item.mutation.mutationId,
            occurrenceId,
            operation: 'delete',
            providerEventId,
          });
        }
        continue;
      }
      const row = await database.getFirstAsync<CachedMissionRow>(
        `SELECT s.payload_json AS series_payload_json,
                o.payload_json AS occurrence_payload_json,
                d.location,
                d.general_note
           FROM cached_mission_occurrences o
           JOIN cached_mission_series s
             ON s.account_id = o.account_id AND s.series_id = o.series_id
           LEFT JOIN search_documents d
             ON d.account_id = o.account_id AND d.occurrence_id = o.occurrence_id
          WHERE o.account_id = ? AND o.occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (row === null) continue;
      const event = eventForCachedMission(row);
      const link = await database.getFirstAsync<{ external_event_id: string }>(
        `SELECT external_event_id FROM external_links
          WHERE account_id = ? AND occurrence_id = ? AND provider = 'apple'`,
        accountId,
        occurrenceId,
      );
      if (link === null) {
        commands.push({
          mutationId: item.mutation.mutationId,
          occurrenceId,
          operation: 'create',
          event,
        });
      } else {
        commands.push({
          mutationId: item.mutation.mutationId,
          occurrenceId,
          operation: 'update',
          providerEventId: link.external_event_id,
          event,
        });
      }
    }
    return commands;
  };

  const settleAppleCommand = async (input: SettleAppleCommandInput): Promise<void> => {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      if (input.operation === 'delete') {
        await transaction.runAsync(
          `DELETE FROM external_links
            WHERE account_id = ? AND occurrence_id = ? AND provider = 'apple'`,
          accountId,
          input.occurrenceId,
        );
      } else {
        const stateRow = await transaction.getFirstAsync<MissionStateRow>(
          `SELECT payload_json, server_version
             FROM cached_mission_occurrences
            WHERE account_id = ? AND occurrence_id = ?`,
          accountId,
          input.occurrenceId,
        );
        const state = stateRow === null ? null : missionStateFromRow(stateRow);
        const ownership: 'app_owned' | 'organizer_controlled' =
          state?.calendarSource === 'internal' ? 'app_owned' : 'organizer_controlled';
        await transaction.runAsync(
          `INSERT INTO external_links
            (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
           VALUES (?, ?, 'apple', ?, ?, ?)
           ON CONFLICT(account_id, occurrence_id, provider) DO UPDATE SET
             external_event_id = excluded.external_event_id,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          accountId,
          input.occurrenceId,
          input.providerEventId,
          JSON.stringify(
            linkPayload({
              connectionId: input.connectionId,
              providerCalendarId: input.providerCalendarId,
              ownership,
            }),
          ),
          now().toISOString(),
        );
      }
      await transaction.runAsync(
        'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
        accountId,
        input.mutationId,
      );
    });
  };

  return {
    findLinkByProviderEventId,
    getMissionSyncState,
    enqueueProviderMutation,
    relinkProviderEvent,
    listPendingAppleCommands,
    settleAppleCommand,
  };
}

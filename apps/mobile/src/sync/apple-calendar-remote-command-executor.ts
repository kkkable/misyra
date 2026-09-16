import type {
  CalendarCommand,
  CalendarCommandResult,
  ExternalCalendarErrorCode,
  ExternalCalendarRecurrenceScope,
} from '@misyra/contracts';

import type {
  AppleCalendarEventWrite,
  AppleCalendarNativeModule as AppleCalendarNativeModuleType,
} from '../../modules/apple-calendar/index.js';
import type { MigrationDatabase } from '../storage/schema.js';
import type {
  AppleCalendarCommandApi,
  AppleCalendarRemoteCommandClaim,
} from './apple-calendar-command-api.js';

export type AppleCalendarRemoteCommandLink = Readonly<{
  occurrenceId: string;
  connectionId: string;
  providerCalendarId: string;
  providerEventId: string;
}>;

export type AppleCalendarRemoteCommandLinkStore = Readonly<{
  findByOccurrenceId(occurrenceId: string): Promise<AppleCalendarRemoteCommandLink | null>;
  save(link: AppleCalendarRemoteCommandLink): Promise<void>;
}>;

type NativeCommandModule = Pick<
  AppleCalendarNativeModuleType,
  'createEvent' | 'updateEvent' | 'deleteEvent'
>;

type ActiveAppleConnection = Readonly<{
  id: string;
  providerCalendarId: string;
}>;

type CommandApi = Pick<AppleCalendarCommandApi, 'claim' | 'settle'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function providerWrite(event: {
  title: string;
  schedule: object;
  recurrence: object | null;
  location: string | null;
  providerNotes: string | null;
}): AppleCalendarEventWrite {
  return {
    title: event.title,
    schedule: { ...event.schedule },
    recurrence: event.recurrence === null ? null : { ...event.recurrence },
    location: event.location,
    providerNotes: event.providerNotes,
  };
}

function completeUpdatePatch(command: Extract<CalendarCommand, { operation: 'update' }>) {
  const patch = command.patch;
  if (
    typeof patch.title !== 'string' ||
    patch.schedule === undefined ||
    !Object.hasOwn(patch, 'recurrence') ||
    !Object.hasOwn(patch, 'location') ||
    !Object.hasOwn(patch, 'providerNotes')
  ) {
    throw new Error('apple_calendar_update_requires_complete_provider_fields');
  }
  return providerWrite({
    title: patch.title,
    schedule: patch.schedule,
    recurrence: patch.recurrence ?? null,
    location: patch.location ?? null,
    providerNotes: patch.providerNotes ?? null,
  });
}

function stableErrorCode(error: unknown): ExternalCalendarErrorCode {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    text.includes('permission') ||
    text.includes('denied') ||
    text.includes('restricted') ||
    text.includes('write_only')
  ) {
    return 'permission_denied';
  }
  if (text.includes('not_found') || text.includes('not found')) return 'not_found';
  if (
    text.includes('unsupported') ||
    text.includes('recurrence') ||
    text.includes('complete_provider_fields') ||
    text.includes('invalid apple calendar provider field')
  ) {
    return 'unsupported';
  }
  return 'unknown';
}

function matchingProviderEventId(
  link: AppleCalendarRemoteCommandLink | null,
  claim: AppleCalendarRemoteCommandClaim,
): string | null {
  if (
    link === null ||
    link.connectionId !== claim.command.connectionId ||
    link.providerCalendarId !== claim.providerCalendarId
  ) {
    return null;
  }
  return link.providerEventId;
}

async function settleFailed(
  api: CommandApi,
  claim: AppleCalendarRemoteCommandClaim,
  error: unknown,
) {
  const result: CalendarCommandResult = {
    commandId: claim.command.commandId,
    status: 'failed',
    errorCode: stableErrorCode(error),
  };
  await api.settle(claim.claimToken, result);
  return { status: 'failed' as const, operation: claim.command.operation, errorCode: result.errorCode };
}

export function createAppleCalendarRemoteCommandExecutor({
  api,
  nativeModule,
  linkStore,
  connection,
}: Readonly<{
  api: CommandApi;
  nativeModule: NativeCommandModule;
  linkStore: AppleCalendarRemoteCommandLinkStore;
  connection: ActiveAppleConnection;
}>) {
  const runOne = async () => {
    const claim = await api.claim();
    if (claim === null) return { status: 'idle' as const };

    if (
      claim.command.connectionId !== connection.id ||
      claim.providerCalendarId !== connection.providerCalendarId
    ) {
      return settleFailed(api, claim, new Error('apple_calendar_command_connection_conflict'));
    }

    let providerEventId: string;
    try {
      const linked = await linkStore.findByOccurrenceId(claim.occurrenceId);
      const retainedProviderEventId = matchingProviderEventId(linked, claim);
      const command = claim.command;

      if (command.operation === 'create') {
        if (retainedProviderEventId !== null) {
          providerEventId = retainedProviderEventId;
        } else {
          const created = await nativeModule.createEvent(
            claim.providerCalendarId,
            providerWrite(command.event),
          );
          providerEventId = created.eventIdentifier;
          if (providerEventId.length === 0) throw new Error('apple_calendar_created_identifier_missing');
          await linkStore.save({
            occurrenceId: claim.occurrenceId,
            connectionId: connection.id,
            providerCalendarId: connection.providerCalendarId,
            providerEventId,
          });
        }
      } else if (command.operation === 'update') {
        const targetProviderEventId = retainedProviderEventId ?? command.providerEventId;
        const updated = await nativeModule.updateEvent(
          targetProviderEventId,
          completeUpdatePatch(command),
          command.recurrenceScope,
        );
        providerEventId = updated.eventIdentifier;
        if (providerEventId.length === 0) throw new Error('apple_calendar_updated_identifier_missing');
        await linkStore.save({
          occurrenceId: claim.occurrenceId,
          connectionId: connection.id,
          providerCalendarId: connection.providerCalendarId,
          providerEventId,
        });
      } else {
        const targetProviderEventId = retainedProviderEventId ?? command.providerEventId;
        await nativeModule.deleteEvent(targetProviderEventId, command.recurrenceScope);
        providerEventId = targetProviderEventId;
      }
    } catch (error) {
      return settleFailed(api, claim, error);
    }

    await api.settle(claim.claimToken, {
      commandId: claim.command.commandId,
      status: 'applied',
      providerEventId,
    });
    return { status: 'applied' as const, operation: claim.command.operation };
  };

  return Object.freeze({
    runOne,
    async runUntilIdle(limit = 25) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new RangeError('Apple Calendar command drain limit must be a positive integer.');
      }
      let applied = 0;
      let failed = 0;
      for (let index = 0; index < limit; index += 1) {
        const result = await runOne();
        if (result.status === 'idle') return { applied, failed, exhausted: false };
        if (result.status === 'applied') applied += 1;
        else failed += 1;
      }
      return { applied, failed, exhausted: true };
    },
  });
}

export function createAppleCalendarRemoteCommandLinkStore({
  database,
  accountId,
  now = () => new Date(),
}: Readonly<{
  database: MigrationDatabase;
  accountId: string;
  now?: () => Date;
}>): AppleCalendarRemoteCommandLinkStore {
  return Object.freeze({
    async findByOccurrenceId(occurrenceId) {
      const row = await database.getFirstAsync<{
        external_event_id: string;
        payload_json: string;
      }>(
        `SELECT external_event_id, payload_json
           FROM external_links
          WHERE account_id = ? AND occurrence_id = ? AND provider = 'apple'`,
        accountId,
        occurrenceId,
      );
      if (row === null) return null;
      const payload = JSON.parse(row.payload_json) as unknown;
      if (
        !isRecord(payload) ||
        typeof payload.connectionId !== 'string' ||
        typeof payload.providerCalendarId !== 'string'
      ) {
        throw new Error('apple_calendar_local_link_invalid');
      }
      return {
        occurrenceId,
        connectionId: payload.connectionId,
        providerCalendarId: payload.providerCalendarId,
        providerEventId: row.external_event_id,
      };
    },
    async save(link) {
      await database.runAsync(
        `INSERT INTO external_links
          (account_id, occurrence_id, provider, external_event_id, payload_json, updated_at)
         VALUES (?, ?, 'apple', ?, ?, ?)
         ON CONFLICT(account_id, occurrence_id, provider) DO UPDATE SET
           external_event_id = excluded.external_event_id,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        accountId,
        link.occurrenceId,
        link.providerEventId,
        JSON.stringify({
          connectionId: link.connectionId,
          providerCalendarId: link.providerCalendarId,
          ownership: 'app_owned',
        }),
        now().toISOString(),
      );
    },
  });
}

export type AppleCalendarRemoteCommandRecurrenceScope = ExternalCalendarRecurrenceScope;

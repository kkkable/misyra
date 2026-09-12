import {
  createMissionOccurrence,
  projectScheduleToTimeZone,
  resolveLocalDateTimeInstant,
  type MissionOccurrenceInput,
} from '@misyra/domain';
import {
  formatMissionCountStartsNow,
  formatMissionStartsNow,
  type MissionNotificationLocale,
} from '@misyra/localization';

const MAX_NOTIFICATION_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
const REGISTRY_METADATA_PREFIX = 'misyra-registry:';
const COMBINED_REGISTRY_PREFIX = 'misyra-combined:';

export type MissionNotificationRequest = Readonly<{
  occurrenceIds?: readonly string[];
  occurrenceId?: string;
  scheduledAt: string;
  localDate?: string;
  body: string;
}>;

export type MissionNotificationScheduler = Readonly<{
  schedule(request: MissionNotificationRequest): Promise<string>;
  cancel(notificationId: string): Promise<void>;
  cancelAll(): Promise<void>;
}>;

type NotificationDatabase = Readonly<{
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
}>;

type ReconcileWindow = Readonly<{
  now: string;
  horizonEnd: string;
  forceReschedule?: boolean;
}>;

type CandidateRow = Readonly<{
  payload_json: string;
  title: string;
}>;

type CandidateNotification = Readonly<{
  occurrenceId: string;
  scheduledAt: string;
  localDate: string;
  title: string;
}>;

type RegistryRow = Readonly<{
  notification_id: string;
  occurrence_id: string;
  scheduled_at: string;
}>;

type StoredNotificationIdentity = Readonly<{
  nativeNotificationId: string;
  occurrenceIds: readonly string[] | null;
  payloadSignature: string | null;
}>;

type DesiredNotification = MissionNotificationRequest &
  Readonly<{
    occurrenceIds: readonly string[];
    localDate: string;
  }>;

function parseInstant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a valid absolute timestamp.`);
  return parsed;
}

function validateWindow(
  window: ReconcileWindow,
): Readonly<{ nowMs: number; horizonEndMs: number }> {
  const nowMs = parseInstant(window.now, 'Notification reconciliation now');
  const horizonEndMs = parseInstant(window.horizonEnd, 'Notification horizon end');
  if (horizonEndMs <= nowMs) throw new RangeError('notification_horizon_must_be_future');
  if (horizonEndMs - nowMs > MAX_NOTIFICATION_HORIZON_MS) {
    throw new RangeError('notification_horizon_exceeds_maximum');
  }
  return { nowMs, horizonEndMs };
}

function resolveLocale(language: string | null): MissionNotificationLocale {
  return language === 'zh-HK' ? 'zh-HK' : 'en';
}

function reminderInstant(payload: ReturnType<typeof createMissionOccurrence>): string {
  if (!payload.schedule.allDay) return payload.schedule.startInstant;
  const localDate = payload.schedule.localStart.slice(0, 10);
  return resolveLocalDateTimeInstant(`${localDate}T09:00:00`, payload.schedule.timeZone);
}

function notificationCalendarDate(
  payload: ReturnType<typeof createMissionOccurrence>,
  appTimeZone: string | null,
): string {
  if (appTimeZone === null) return payload.schedule.localStart.slice(0, 10);
  return projectScheduleToTimeZone({
    schedule: payload.schedule,
    destinationTimeZone: appTimeZone,
  }).localStart.slice(0, 10);
}

function isEligibleForReminder(payload: ReturnType<typeof createMissionOccurrence>): boolean {
  return (
    payload.scheduleState === 'scheduled' &&
    payload.completionState === 'incomplete' &&
    payload.deletionState === 'active'
  );
}

function groupDesiredNotifications(
  candidates: readonly CandidateNotification[],
  locale: MissionNotificationLocale,
): DesiredNotification[] {
  const byInstant = new Map<string, CandidateNotification[]>();
  for (const candidate of candidates) {
    const group = byInstant.get(candidate.scheduledAt);
    if (group === undefined) byInstant.set(candidate.scheduledAt, [candidate]);
    else group.push(candidate);
  }

  return [...byInstant.entries()]
    .map(([scheduledAt, group]) => {
      const sorted = [...group].sort((left, right) =>
        left.occurrenceId.localeCompare(right.occurrenceId),
      );
      const first = sorted[0];
      if (first === undefined) throw new Error('notification_group_empty');
      const occurrenceIds = Object.freeze(sorted.map((item) => item.occurrenceId));
      const base = {
        occurrenceIds,
        scheduledAt,
        localDate: first.localDate,
        body:
          sorted.length === 1
            ? formatMissionStartsNow(locale, first.title)
            : formatMissionCountStartsNow(locale, sorted.length),
      };
      return sorted.length === 1
        ? Object.freeze({ ...base, occurrenceId: first.occurrenceId })
        : Object.freeze(base);
    })
    .sort((left, right) => {
      const scheduledOrder = left.scheduledAt.localeCompare(right.scheduledAt);
      if (scheduledOrder !== 0) return scheduledOrder;
      const leftOccurrenceId = left.occurrenceIds[0] ?? '';
      const rightOccurrenceId = right.occurrenceIds[0] ?? '';
      return leftOccurrenceId.localeCompare(rightOccurrenceId);
    });
}

async function loadDesiredNotifications(
  database: NotificationDatabase,
  accountId: string,
  window: Readonly<{ nowMs: number; horizonEndMs: number }>,
): Promise<DesiredNotification[]> {
  const account = await database.getFirstAsync<{
    language: string | null;
    app_time_zone: string | null;
  }>(`SELECT language, app_time_zone FROM local_accounts WHERE account_id = ?`, accountId);
  const locale = resolveLocale(account?.language ?? null);
  const appTimeZone = account?.app_time_zone ?? null;
  const rows = await database.getAllAsync<CandidateRow>(
    `SELECT o.payload_json, s.title
       FROM cached_mission_occurrences AS o
       JOIN cached_mission_series AS s
         ON s.account_id = o.account_id
        AND s.series_id = o.series_id
      WHERE o.account_id = ?`,
    accountId,
  );

  const candidates: CandidateNotification[] = [];
  for (const row of rows) {
    const parsed = JSON.parse(row.payload_json) as MissionOccurrenceInput;
    const occurrence = createMissionOccurrence(parsed);
    if (!isEligibleForReminder(occurrence)) continue;

    const scheduledAt = reminderInstant(occurrence);
    const scheduledMs = parseInstant(scheduledAt, 'Notification scheduled time');
    if (scheduledMs <= window.nowMs || scheduledMs >= window.horizonEndMs) continue;

    candidates.push(
      Object.freeze({
        occurrenceId: occurrence.id,
        scheduledAt,
        localDate: notificationCalendarDate(occurrence, appTimeZone),
        title: row.title,
      }),
    );
  }

  return groupDesiredNotifications(candidates, locale);
}

function notificationPayloadSignature(notification: DesiredNotification): string {
  return `${notification.localDate}\u0000${notification.body}`;
}

function encodeStoredNotificationId(
  nativeNotificationId: string,
  occurrenceIds: readonly string[],
  payloadSignature: string,
): string {
  return `${REGISTRY_METADATA_PREFIX}${encodeURIComponent(
    JSON.stringify({ nativeNotificationId, occurrenceIds, payloadSignature }),
  )}`;
}

function invalidStoredNotificationIdentity(value: string): StoredNotificationIdentity {
  return Object.freeze({
    nativeNotificationId: value,
    occurrenceIds: null,
    payloadSignature: null,
  });
}

function sortedOccurrenceIds(value: unknown, minimumLength: number): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    return null;
  }
  return Object.freeze(
    [...new Set(value as string[])].sort((left, right) => left.localeCompare(right)),
  );
}

function decodeRegistryMetadata(value: string): StoredNotificationIdentity {
  try {
    const decoded = JSON.parse(
      decodeURIComponent(value.slice(REGISTRY_METADATA_PREFIX.length)),
    ) as Readonly<{
      nativeNotificationId?: unknown;
      occurrenceIds?: unknown;
      payloadSignature?: unknown;
    }>;
    const occurrenceIds = sortedOccurrenceIds(decoded.occurrenceIds, 1);
    if (
      typeof decoded.nativeNotificationId !== 'string' ||
      decoded.nativeNotificationId.length === 0 ||
      occurrenceIds === null ||
      typeof decoded.payloadSignature !== 'string'
    ) {
      return invalidStoredNotificationIdentity(value);
    }
    return Object.freeze({
      nativeNotificationId: decoded.nativeNotificationId,
      occurrenceIds,
      payloadSignature: decoded.payloadSignature,
    });
  } catch {
    return invalidStoredNotificationIdentity(value);
  }
}

function decodeLegacyCombinedNotificationId(value: string): StoredNotificationIdentity {
  try {
    const decoded = JSON.parse(
      decodeURIComponent(value.slice(COMBINED_REGISTRY_PREFIX.length)),
    ) as Readonly<{ nativeNotificationId?: unknown; occurrenceIds?: unknown }>;
    const occurrenceIds = sortedOccurrenceIds(decoded.occurrenceIds, 2);
    if (
      typeof decoded.nativeNotificationId !== 'string' ||
      decoded.nativeNotificationId.length === 0 ||
      occurrenceIds === null
    ) {
      return invalidStoredNotificationIdentity(value);
    }
    return Object.freeze({
      nativeNotificationId: decoded.nativeNotificationId,
      occurrenceIds,
      payloadSignature: null,
    });
  } catch {
    return invalidStoredNotificationIdentity(value);
  }
}

function decodeStoredNotificationId(value: string): StoredNotificationIdentity {
  if (value.startsWith(REGISTRY_METADATA_PREFIX)) return decodeRegistryMetadata(value);
  if (value.startsWith(COMBINED_REGISTRY_PREFIX)) return decodeLegacyCombinedNotificationId(value);
  return invalidStoredNotificationIdentity(value);
}

function notificationSignature(scheduledAt: string, occurrenceIds: readonly string[]): string {
  return `${scheduledAt}\u0000${occurrenceIds.join('\u0000')}`;
}

async function deleteRegistryRow(
  database: NotificationDatabase,
  accountId: string,
  storedNotificationId: string,
): Promise<void> {
  await database.runAsync(
    `DELETE FROM notification_registry
      WHERE account_id = ? AND notification_id = ?`,
    accountId,
    storedNotificationId,
  );
}

async function scheduleAndPersist(
  database: NotificationDatabase,
  accountId: string,
  scheduler: MissionNotificationScheduler,
  desired: DesiredNotification,
  updatedAt: string,
): Promise<void> {
  const nativeNotificationId = await scheduler.schedule(desired);
  const storedNotificationId = encodeStoredNotificationId(
    nativeNotificationId,
    desired.occurrenceIds,
    notificationPayloadSignature(desired),
  );
  const canonicalOccurrenceId = desired.occurrenceIds[0];
  if (canonicalOccurrenceId === undefined) throw new Error('notification_group_empty');

  try {
    await database.runAsync(
      `INSERT INTO notification_registry
        (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      accountId,
      storedNotificationId,
      canonicalOccurrenceId,
      desired.scheduledAt,
      updatedAt,
    );
  } catch (error) {
    try {
      await scheduler.cancel(nativeNotificationId);
    } catch {
      // Preserve the persistence failure while making a best-effort orphan cleanup.
    }
    throw error;
  }
}

export function createMissionNotificationReconciler({
  database,
  accountId,
  scheduler,
}: Readonly<{
  database: NotificationDatabase;
  accountId: string;
  scheduler: MissionNotificationScheduler;
}>) {
  let runTail: Promise<void> = Promise.resolve();

  async function reconcileOnce(input: ReconcileWindow): Promise<void> {
    const window = validateWindow(input);
    const desired = await loadDesiredNotifications(database, accountId, window);
    const desiredBySignature = new Map(
      desired.map((item) => [notificationSignature(item.scheduledAt, item.occurrenceIds), item]),
    );
    const registryRows = await database.getAllAsync<RegistryRow>(
      `SELECT notification_id, occurrence_id, scheduled_at
         FROM notification_registry
        WHERE account_id = ?
        ORDER BY scheduled_at, notification_id`,
      accountId,
    );

    const retainedSignatures = new Set<string>();
    for (const row of registryRows) {
      const storedIdentity = decodeStoredNotificationId(row.notification_id);
      const occurrenceIds = storedIdentity.occurrenceIds ?? Object.freeze([row.occurrence_id]);
      const canonicalOccurrenceId = occurrenceIds[0];
      const signature = notificationSignature(row.scheduled_at, occurrenceIds);
      const desiredNotification = desiredBySignature.get(signature);
      const shouldRetain =
        input.forceReschedule !== true &&
        canonicalOccurrenceId === row.occurrence_id &&
        desiredNotification !== undefined &&
        storedIdentity.payloadSignature === notificationPayloadSignature(desiredNotification) &&
        !retainedSignatures.has(signature);
      if (shouldRetain) {
        retainedSignatures.add(signature);
        continue;
      }

      await scheduler.cancel(storedIdentity.nativeNotificationId);
      await deleteRegistryRow(database, accountId, row.notification_id);
    }

    for (const item of desired) {
      const signature = notificationSignature(item.scheduledAt, item.occurrenceIds);
      if (retainedSignatures.has(signature)) continue;
      await scheduleAndPersist(database, accountId, scheduler, item, input.now);
      retainedSignatures.add(signature);
    }
  }

  return Object.freeze({
    reconcile(input: ReconcileWindow): Promise<void> {
      const run = runTail.then(
        () => reconcileOnce(input),
        () => reconcileOnce(input),
      );
      runTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  });
}

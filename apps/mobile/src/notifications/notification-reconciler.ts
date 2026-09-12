import {
  createMissionOccurrence,
  resolveLocalDateTimeInstant,
  type MissionOccurrenceInput,
} from '@misyra/domain';
import {
  formatMissionCountStartsNow,
  formatMissionStartsNow,
  type MissionNotificationLocale,
} from '@misyra/localization';

const MAX_NOTIFICATION_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export type MissionNotificationRequest = Readonly<{
  occurrenceIds: readonly string[];
  occurrenceId?: string;
  scheduledAt: string;
  localDate: string;
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

type RegistryNotification = Readonly<{
  notificationId: string;
  occurrenceIds: readonly string[];
  scheduledAt: string | null;
}>;

type DesiredNotification = MissionNotificationRequest;

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
      const sorted = [...group].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId));
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
    .sort(
      (left, right) =>
        left.scheduledAt.localeCompare(right.scheduledAt) ||
        left.occurrenceIds[0]!.localeCompare(right.occurrenceIds[0]!),
    );
}

async function loadDesiredNotifications(
  database: NotificationDatabase,
  accountId: string,
  window: Readonly<{ nowMs: number; horizonEndMs: number }>,
): Promise<DesiredNotification[]> {
  const account = await database.getFirstAsync<{ language: string | null }>(
    `SELECT language FROM local_accounts WHERE account_id = ?`,
    accountId,
  );
  const locale = resolveLocale(account?.language ?? null);
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
        localDate: occurrence.schedule.localStart.slice(0, 10),
        title: row.title,
      }),
    );
  }

  return groupDesiredNotifications(candidates, locale);
}

function groupRegistryRows(rows: readonly RegistryRow[]): RegistryNotification[] {
  const grouped = new Map<
    string,
    { occurrenceIds: string[]; scheduledAt: string | null; inconsistent: boolean }
  >();
  for (const row of rows) {
    const existing = grouped.get(row.notification_id);
    if (existing === undefined) {
      grouped.set(row.notification_id, {
        occurrenceIds: [row.occurrence_id],
        scheduledAt: row.scheduled_at,
        inconsistent: false,
      });
      continue;
    }
    existing.occurrenceIds.push(row.occurrence_id);
    if (existing.scheduledAt !== row.scheduled_at) existing.inconsistent = true;
  }

  return [...grouped.entries()]
    .map(([notificationId, value]) =>
      Object.freeze({
        notificationId,
        occurrenceIds: Object.freeze(
          [...new Set(value.occurrenceIds)].sort((left, right) => left.localeCompare(right)),
        ),
        scheduledAt: value.inconsistent ? null : value.scheduledAt,
      }),
    )
    .sort((left, right) => left.notificationId.localeCompare(right.notificationId));
}

function notificationSignature(
  scheduledAt: string,
  occurrenceIds: readonly string[],
): string {
  return `${scheduledAt}\u0000${occurrenceIds.join('\u0000')}`;
}

async function deleteRegistryRows(
  database: NotificationDatabase,
  accountId: string,
  notificationId: string,
): Promise<void> {
  await database.runAsync(
    `DELETE FROM notification_registry
      WHERE account_id = ? AND notification_id = ?`,
    accountId,
    notificationId,
  );
}

async function scheduleAndPersist(
  database: NotificationDatabase,
  accountId: string,
  scheduler: MissionNotificationScheduler,
  desired: DesiredNotification,
  updatedAt: string,
): Promise<void> {
  const notificationId = await scheduler.schedule(desired);
  try {
    for (const occurrenceId of desired.occurrenceIds) {
      await database.runAsync(
        `INSERT INTO notification_registry
          (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        accountId,
        notificationId,
        occurrenceId,
        desired.scheduledAt,
        updatedAt,
      );
    }
  } catch (error) {
    try {
      await deleteRegistryRows(database, accountId, notificationId);
    } catch {
      // Preserve the persistence failure while making a best-effort registry cleanup.
    }
    try {
      await scheduler.cancel(notificationId);
    } catch {
      // Preserve the persistence failure while making a best-effort native cleanup.
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
        ORDER BY scheduled_at, notification_id, occurrence_id`,
      accountId,
    );
    const registryNotifications = groupRegistryRows(registryRows);

    const retainedSignatures = new Set<string>();
    for (const registryNotification of registryNotifications) {
      const signature =
        registryNotification.scheduledAt === null
          ? null
          : notificationSignature(
              registryNotification.scheduledAt,
              registryNotification.occurrenceIds,
            );
      const shouldRetain =
        signature !== null &&
        desiredBySignature.has(signature) &&
        !retainedSignatures.has(signature);
      if (shouldRetain) {
        retainedSignatures.add(signature);
        continue;
      }

      await scheduler.cancel(registryNotification.notificationId);
      await deleteRegistryRows(database, accountId, registryNotification.notificationId);
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

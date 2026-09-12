import {
  createMissionOccurrence,
  resolveLocalDateTimeInstant,
  type MissionOccurrenceInput,
} from '@misyra/domain';
import { formatMissionStartsNow, type MissionNotificationLocale } from '@misyra/localization';

const MAX_NOTIFICATION_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export type MissionNotificationRequest = Readonly<{
  occurrenceId: string;
  scheduledAt: string;
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

type RegistryRow = Readonly<{
  notification_id: string;
  occurrence_id: string;
  scheduled_at: string;
}>;

type DesiredNotification = Readonly<{
  occurrenceId: string;
  scheduledAt: string;
  body: string;
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

function isEligibleForReminder(payload: ReturnType<typeof createMissionOccurrence>): boolean {
  return (
    payload.scheduleState === 'scheduled' &&
    payload.completionState === 'incomplete' &&
    payload.deletionState === 'active'
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

  const desired: DesiredNotification[] = [];
  for (const row of rows) {
    const parsed = JSON.parse(row.payload_json) as MissionOccurrenceInput;
    const occurrence = createMissionOccurrence(parsed);
    if (!isEligibleForReminder(occurrence)) continue;

    const scheduledAt = reminderInstant(occurrence);
    const scheduledMs = parseInstant(scheduledAt, 'Notification scheduled time');
    if (scheduledMs <= window.nowMs || scheduledMs >= window.horizonEndMs) continue;

    desired.push(
      Object.freeze({
        occurrenceId: occurrence.id,
        scheduledAt,
        body: formatMissionStartsNow(locale, row.title),
      }),
    );
  }

  return desired.sort(
    (left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt) ||
      left.occurrenceId.localeCompare(right.occurrenceId),
  );
}

async function deleteRegistryRow(
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
    await database.runAsync(
      `INSERT INTO notification_registry
        (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      accountId,
      notificationId,
      desired.occurrenceId,
      desired.scheduledAt,
      updatedAt,
    );
  } catch (error) {
    try {
      await scheduler.cancel(notificationId);
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
    const desiredByOccurrence = new Map(desired.map((item) => [item.occurrenceId, item]));
    const registryRows = await database.getAllAsync<RegistryRow>(
      `SELECT notification_id, occurrence_id, scheduled_at
         FROM notification_registry
        WHERE account_id = ?
        ORDER BY scheduled_at, notification_id`,
      accountId,
    );

    const retainedOccurrences = new Set<string>();
    for (const row of registryRows) {
      const target = desiredByOccurrence.get(row.occurrence_id);
      const shouldRetain =
        target !== undefined &&
        row.scheduled_at === target.scheduledAt &&
        !retainedOccurrences.has(row.occurrence_id);
      if (shouldRetain) {
        retainedOccurrences.add(row.occurrence_id);
        continue;
      }

      await scheduler.cancel(row.notification_id);
      await deleteRegistryRow(database, accountId, row.notification_id);
    }

    for (const item of desired) {
      if (retainedOccurrences.has(item.occurrenceId)) continue;
      await scheduleAndPersist(database, accountId, scheduler, item, input.now);
      retainedOccurrences.add(item.occurrenceId);
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

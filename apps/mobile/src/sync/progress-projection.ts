import type { ServerAccountChange, ServerSyncDatabase } from './server-sync.js';

type ProgressRecentItem = Readonly<{
  occurrenceId: string;
  title: string;
  completedAt: string;
  awardedXp: number;
}>;

type ProgressProjection = Readonly<{
  totalXp: number;
  totalCompleted: number;
  currentStreak: number;
  longestStreak: number;
  updatedAt: string;
  recent: readonly ProgressRecentItem[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Progress ${label} must be a non-negative integer.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Progress ${label} must be a non-empty string.`);
  }
  return value;
}

function parseProgressProjection(value: unknown): ProgressProjection {
  if (!isRecord(value)) throw new Error('Progress change payload must be an object.');
  const totalXp = nonNegativeInteger(value.totalXp, 'total XP');
  const totalCompleted = nonNegativeInteger(value.totalCompleted, 'total completed');
  const currentStreak = nonNegativeInteger(value.currentStreak, 'current streak');
  const longestStreak = nonNegativeInteger(value.longestStreak, 'longest streak');
  if (longestStreak < currentStreak) {
    throw new Error('Progress longest streak must not be shorter than current streak.');
  }
  const updatedAt = requiredString(value.updatedAt, 'updated time');
  if (!Array.isArray(value.recent) || value.recent.length > 20) {
    throw new Error('Progress recent completions must be an array of at most 20 items.');
  }
  const recent = value.recent.map((item): ProgressRecentItem => {
    if (!isRecord(item)) throw new Error('Progress recent completion must be an object.');
    return {
      occurrenceId: requiredString(item.occurrenceId, 'recent occurrence ID'),
      title: requiredString(item.title, 'recent title'),
      completedAt: requiredString(item.completedAt, 'recent completion time'),
      awardedXp: nonNegativeInteger(item.awardedXp, 'recent awarded XP'),
    };
  });
  return { totalXp, totalCompleted, currentStreak, longestStreak, updatedAt, recent };
}

export async function applyProgressProjectionChange(
  transaction: ServerSyncDatabase,
  accountId: string,
  change: ServerAccountChange,
): Promise<boolean> {
  if (change.entityType !== 'progress') return false;
  if (change.operation !== 'upsert' || change.entityId !== accountId) {
    throw new Error('Unsupported Progress change identity or operation.');
  }
  const progress = parseProgressProjection(change.payload);

  await transaction.runAsync(
    `INSERT INTO progress_snapshots
      (account_id, total_xp, total_completed, current_streak, longest_streak, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       total_xp = excluded.total_xp,
       total_completed = excluded.total_completed,
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       updated_at = excluded.updated_at`,
    accountId,
    progress.totalXp,
    progress.totalCompleted,
    progress.currentStreak,
    progress.longestStreak,
    progress.updatedAt,
  );

  for (const item of progress.recent) {
    await transaction.runAsync(
      `INSERT INTO completion_summaries
        (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
       SELECT ?, o.occurrence_id, ?, ?, ?, ?
         FROM cached_mission_occurrences o
        WHERE o.account_id = ?
          AND o.occurrence_id = ?
          AND json_extract(o.payload_json, '$.deletionState') <> 'deleted'
       ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
         completed_at = excluded.completed_at,
         awarded_xp = excluded.awarded_xp,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      accountId,
      item.completedAt,
      item.awardedXp,
      JSON.stringify({ title: item.title }),
      progress.updatedAt,
      accountId,
      item.occurrenceId,
    );
  }
  return true;
}

import type { PoolClient, QueryResultRow } from 'pg';

type ProgressAggregateRow = QueryResultRow &
  Readonly<{
    totalXp: number;
    totalCompleted: number;
  }>;

type StreakStateRow = QueryResultRow &
  Readonly<{
    state: 'paused' | 'continued' | 'broken' | 'pending';
  }>;

type RecentCompletionRow = QueryResultRow &
  Readonly<{
    occurrenceId: string;
    title: string;
    completedAt: Date;
    awardedXp: number;
  }>;

export type AuthoritativeProgressProjection = Readonly<{
  totalXp: number;
  totalCompleted: number;
  currentStreak: number;
  longestStreak: number;
  updatedAt: string;
  recent: readonly Readonly<{
    occurrenceId: string;
    title: string;
    completedAt: string;
    awardedXp: number;
  }>[];
}>;

function streakTotals(rows: readonly StreakStateRow[]): Readonly<{
  currentStreak: number;
  longestStreak: number;
}> {
  let currentStreak = 0;
  let longestStreak = 0;

  for (const row of rows) {
    if (row.state === 'continued') {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
      continue;
    }
    if (row.state === 'broken') currentStreak = 0;
  }

  return { currentStreak, longestStreak };
}

export async function buildAuthoritativeProgressProjection(
  client: PoolClient,
  input: Readonly<{
    accountId: string;
    occurrenceId: string;
    title: string;
    completedAt: string;
    awardedXp: number;
  }>,
): Promise<AuthoritativeProgressProjection> {
  const aggregateResult = await client.query<ProgressAggregateRow>(
    `SELECT
       COALESCE(sum(awarded_xp), 0)::int AS "totalXp",
       count(*)::int AS "totalCompleted"
     FROM reward_ledger
     WHERE account_id = $1`,
    [input.accountId],
  );
  const streakResult = await client.query<StreakStateRow>(
    `SELECT state
     FROM streak_days
     WHERE account_id = $1
     ORDER BY local_date`,
    [input.accountId],
  );
  const recentResult = await client.query<RecentCompletionRow>(
    `SELECT
       c.occurrence_id AS "occurrenceId",
       s.title,
       c.action_time AS "completedAt",
       r.awarded_xp AS "awardedXp"
     FROM mission_completions c
     JOIN reward_ledger r
       ON r.account_id = c.account_id
      AND r.occurrence_id = c.occurrence_id
     JOIN mission_occurrences o
       ON o.account_id = c.account_id
      AND o.id = c.occurrence_id
     JOIN mission_series s
       ON s.account_id = o.account_id
      AND s.id = o.series_id
     WHERE c.account_id = $1
       AND o.deletion_state <> 'deleted'
     ORDER BY c.action_time DESC, c.occurrence_id
     LIMIT 20`,
    [input.accountId],
  );
  const aggregate = aggregateResult.rows[0] ?? { totalXp: 0, totalCompleted: 0 };
  const streak = streakTotals(streakResult.rows);

  return Object.freeze({
    totalXp: aggregate.totalXp,
    totalCompleted: aggregate.totalCompleted,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    updatedAt: input.completedAt,
    recent: Object.freeze(
      recentResult.rows.map((row) =>
        Object.freeze({
          occurrenceId: row.occurrenceId,
          title: row.title,
          completedAt: row.completedAt.toISOString(),
          awardedXp: row.awardedXp,
        }),
      ),
    ),
  });
}

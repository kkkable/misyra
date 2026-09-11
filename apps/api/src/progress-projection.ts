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

export type AuthoritativeProgressProjection = Readonly<{
  totalXp: number;
  totalCompleted: number;
  currentStreak: number;
  longestStreak: number;
  updatedAt: string;
  completion: Readonly<{
    occurrenceId: string;
    title: string;
    completedAt: string;
    awardedXp: number;
  }>;
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
  const [aggregateResult, streakResult] = await Promise.all([
    client.query<ProgressAggregateRow>(
      `SELECT
         COALESCE(sum(awarded_xp), 0)::int AS "totalXp",
         count(*)::int AS "totalCompleted"
       FROM reward_ledger
       WHERE account_id = $1`,
      [input.accountId],
    ),
    client.query<StreakStateRow>(
      `SELECT state
       FROM streak_days
       WHERE account_id = $1
       ORDER BY local_date`,
      [input.accountId],
    ),
  ]);
  const aggregate = aggregateResult.rows[0] ?? { totalXp: 0, totalCompleted: 0 };
  const streak = streakTotals(streakResult.rows);

  return Object.freeze({
    totalXp: aggregate.totalXp,
    totalCompleted: aggregate.totalCompleted,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    updatedAt: input.completedAt,
    completion: Object.freeze({
      occurrenceId: input.occurrenceId,
      title: input.title,
      completedAt: input.completedAt,
      awardedXp: input.awardedXp,
    }),
  });
}

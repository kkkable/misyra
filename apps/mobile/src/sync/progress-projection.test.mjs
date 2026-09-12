import { describe, expect, it } from 'vitest';

import { applyProgressProjectionChange } from './progress-projection.js';

describe('MTS-060 Progress sync projection', () => {
  it('preserves completion summaries outside the bounded recent Progress payload', async () => {
    const statements = [];
    const transaction = {
      async runAsync(source) {
        statements.push(source);
        return { changes: 1 };
      },
    };

    await applyProgressProjectionChange(transaction, 'account-progress', {
      entityType: 'progress',
      entityId: 'account-progress',
      operation: 'upsert',
      payload: {
        totalXp: 250,
        totalCompleted: 1,
        currentStreak: 1,
        longestStreak: 1,
        updatedAt: '2026-09-12T01:10:00.000Z',
        recent: [
          {
            occurrenceId: '33333333-3333-4333-8333-333333333333',
            title: 'Recent completion',
            completedAt: '2026-09-12T01:10:00.000Z',
            awardedXp: 250,
          },
        ],
      },
    });

    expect(statements.some((source) => source.includes('DELETE FROM completion_summaries'))).toBe(
      false,
    );
  });
});

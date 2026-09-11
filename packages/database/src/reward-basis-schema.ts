import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { missionOccurrences } from './schema.js';

export const missionRewardBasis = pgTable(
  'mission_reward_basis',
  {
    occurrenceId: uuid('occurrence_id').primaryKey(),
    accountId: uuid('account_id').notNull(),
    difficulty: text('difficulty'),
    baseXp: integer('base_xp').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mission_reward_basis_account_idx').on(table.accountId),
    foreignKey({
      columns: [table.occurrenceId, table.accountId],
      foreignColumns: [missionOccurrences.id, missionOccurrences.accountId],
      name: 'mission_reward_basis_occurrence_account_fk',
    }).onDelete('cascade'),
    check(
      'mission_reward_basis_difficulty_check',
      sql`${table.difficulty} is null or ${table.difficulty} in ('easy', 'normal', 'hard')`,
    ),
    check('mission_reward_basis_base_xp_check', sql`${table.baseXp} between 0 and 250`),
    check(
      'mission_reward_basis_state_check',
      sql`(${table.difficulty} is not null and ${table.baseXp} > 0 and ${table.revokedAt} is null) or (${table.baseXp} = 0 and ${table.revokedAt} is not null)`,
    ),
  ],
);

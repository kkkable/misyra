import { getTableName, sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    consumedProviderNonceHashes: text('consumed_provider_nonce_hashes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('accounts_provider_subject_uidx').on(table.provider, table.providerSubject),
    check('accounts_provider_check', sql`${table.provider} in ('apple', 'google')`),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('devices_account_idx').on(table.accountId)],
);

export const accountSessions = pgTable(
  'account_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    familyId: uuid('family_id').notNull().defaultRandom(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    rotatedRefreshTokenHashes: text('rotated_refresh_token_hashes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('account_sessions_account_idx').on(table.accountId),
    index('account_sessions_family_idx').on(table.familyId),
    uniqueIndex('account_sessions_refresh_hash_uidx').on(table.refreshTokenHash),
  ],
);

export const userSettings = pgTable('user_settings', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  language: text('language').notNull().default('en'),
  trustMode: boolean('trust_mode').notNull().default(false),
  appTimeZone: text('app_time_zone').notNull().default('UTC'),
  updatedAt: updatedAt(),
});

export const missionSeries = pgTable(
  'mission_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    recurrenceRule: jsonb('recurrence_rule'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('mission_series_account_idx').on(table.accountId),
    uniqueIndex('mission_series_id_account_uidx').on(table.id, table.accountId),
  ],
);

export const missionOccurrences = pgTable(
  'mission_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').notNull(),
    localDate: date('local_date').notNull(),
    localStart: text('local_start').notNull(),
    localFinish: text('local_finish').notNull(),
    startInstant: timestamp('start_instant', { withTimezone: true }).notNull(),
    finishInstant: timestamp('finish_instant', { withTimezone: true }).notNull(),
    timeZone: text('time_zone').notNull(),
    timeBehavior: text('time_behavior').notNull(),
    allDay: boolean('all_day').notNull().default(false),
    estimatedEffortMinutes: integer('estimated_effort_minutes'),
    scheduleState: text('schedule_state').notNull().default('scheduled'),
    completionState: text('completion_state').notNull().default('incomplete'),
    evidenceState: text('evidence_state').notNull().default('not_submitted'),
    rewardEligibility: text('reward_eligibility').notNull().default('undetermined'),
    rewardIssuance: text('reward_issuance').notNull().default('not_issued'),
    calendarSource: text('calendar_source').notNull().default('internal'),
    fieldOwnership: text('field_ownership').notNull().default('app_owned'),
    synchronizationState: text('synchronization_state').notNull().default('local_only'),
    storyState: text('story_state').notNull().default('none'),
    deletionState: text('deletion_state').notNull().default('active'),
    location: text('location'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('mission_occurrences_account_date_idx').on(table.accountId, table.localDate),
    index('mission_occurrences_series_idx').on(table.seriesId),
    uniqueIndex('mission_occurrences_id_account_uidx').on(table.id, table.accountId),
    foreignKey({
      columns: [table.seriesId, table.accountId],
      foreignColumns: [missionSeries.id, missionSeries.accountId],
      name: 'mission_occurrences_series_account_fk',
    }).onDelete('restrict'),
    check(
      'mission_occurrences_time_behavior_check',
      sql`${table.timeBehavior} in ('local_time', 'fixed_instant')`,
    ),
    check(
      'mission_occurrences_schedule_state_check',
      sql`${table.scheduleState} in ('scheduled', 'cancelled')`,
    ),
    check(
      'mission_occurrences_completion_state_check',
      sql`${table.completionState} in ('incomplete', 'completed')`,
    ),
    check(
      'mission_occurrences_evidence_state_check',
      sql`${table.evidenceState} in ('not_submitted', 'pending', 'accepted', 'rejected', 'not_required')`,
    ),
    check(
      'mission_occurrences_reward_eligibility_check',
      sql`${table.rewardEligibility} in ('undetermined', 'eligible', 'ineligible')`,
    ),
    check(
      'mission_occurrences_reward_issuance_check',
      sql`${table.rewardIssuance} in ('not_issued', 'issued')`,
    ),
    check(
      'mission_occurrences_calendar_source_check',
      sql`${table.calendarSource} in ('internal', 'external')`,
    ),
    check(
      'mission_occurrences_field_ownership_check',
      sql`${table.fieldOwnership} in ('app_owned', 'organizer_controlled')`,
    ),
    check(
      'mission_occurrences_synchronization_state_check',
      sql`${table.synchronizationState} in ('local_only', 'pending', 'synced', 'failed')`,
    ),
    check(
      'mission_occurrences_story_state_check',
      sql`${table.storyState} in ('none', 'draft', 'ready')`,
    ),
    check(
      'mission_occurrences_deletion_state_check',
      sql`${table.deletionState} in ('active', 'deleted')`,
    ),
    check(
      'mission_occurrences_finish_after_start_check',
      sql`${table.finishInstant} > ${table.startInstant}`,
    ),
    check('mission_occurrences_version_check', sql`${table.version} > 0`),
    check(
      'mission_occurrences_effort_check',
      sql`(${table.allDay} = false and ${table.estimatedEffortMinutes} is null) or (${table.allDay} = true and ${table.estimatedEffortMinutes} > 0)`,
    ),
  ],
);

export const missionOccurrenceTombstones = pgTable(
  'mission_occurrence_tombstones',
  {
    occurrenceId: uuid('occurrence_id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
  },
  (table) => [index('mission_occurrence_tombstones_account_idx').on(table.accountId)],
);

export const missionPersonalNotes = pgTable(
  'mission_personal_notes',
  {
    occurrenceId: uuid('occurrence_id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('mission_personal_notes_account_idx').on(table.accountId),
    foreignKey({
      columns: [table.occurrenceId, table.accountId],
      foreignColumns: [missionOccurrences.id, missionOccurrences.accountId],
      name: 'mission_personal_notes_occurrence_account_fk',
    }).onDelete('cascade'),
  ],
);

export const missionCompletions = pgTable(
  'mission_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id').notNull(),
    completionType: text('completion_type').notNull(),
    actionTime: timestamp('action_time', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('mission_completions_occurrence_uidx').on(table.occurrenceId),
    index('mission_completions_account_idx').on(table.accountId),
    foreignKey({
      columns: [table.occurrenceId, table.accountId],
      foreignColumns: [missionOccurrences.id, missionOccurrences.accountId],
      name: 'mission_completions_occurrence_account_fk',
    }).onDelete('cascade'),
  ],
);

export const evidenceAttempts = pgTable(
  'evidence_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id').notNull(),
    attemptNumber: smallint('attempt_number').notNull(),
    status: text('status').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('evidence_attempts_occurrence_attempt_uidx').on(
      table.occurrenceId,
      table.attemptNumber,
    ),
    index('evidence_attempts_account_idx').on(table.accountId),
    foreignKey({
      columns: [table.occurrenceId, table.accountId],
      foreignColumns: [missionOccurrences.id, missionOccurrences.accountId],
      name: 'evidence_attempts_occurrence_account_fk',
    }).onDelete('cascade'),
    check('evidence_attempts_number_check', sql`${table.attemptNumber} between 1 and 3`),
  ],
);

export const rewardLedger = pgTable(
  'reward_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id').notNull(),
    baseXp: integer('base_xp').notNull(),
    proofBonusXp: integer('proof_bonus_xp').notNull(),
    awardedXp: integer('awarded_xp').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('reward_ledger_occurrence_uidx').on(table.occurrenceId),
    index('reward_ledger_account_idx').on(table.accountId),
  ],
);

export const streakDays = pgTable(
  'streak_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    state: text('state').notNull(),
    finalized: boolean('finalized').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('streak_days_account_date_uidx').on(table.accountId, table.localDate)],
);

export const storyDrafts = pgTable(
  'story_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id').notNull(),
    state: text('state').notNull().default('active'),
    aiGenerationCount: smallint('ai_generation_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('story_drafts_active_occurrence_uidx')
      .on(table.occurrenceId)
      .where(sql`${table.state} = 'active'`),
    index('story_drafts_account_idx').on(table.accountId),
    foreignKey({
      columns: [table.occurrenceId, table.accountId],
      foreignColumns: [missionOccurrences.id, missionOccurrences.accountId],
      name: 'story_drafts_occurrence_account_fk',
    }).onDelete('cascade'),
    check(
      'story_drafts_ai_generation_count_check',
      sql`${table.aiGenerationCount} between 0 and 3`,
    ),
  ],
);

export const storyImageVersions = pgTable(
  'story_image_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => storyDrafts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('story_image_versions_draft_idx').on(table.draftId)],
);

export const storyCompositions = pgTable(
  'story_compositions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => storyDrafts.id, { onDelete: 'cascade' }),
    composition: jsonb('composition').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('story_compositions_draft_idx').on(table.draftId)],
);

export const storyStyleProfiles = pgTable(
  'story_style_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    profile: jsonb('profile').notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('story_style_profiles_account_uidx').on(table.accountId)],
);

export const aiPlannerDrafts = pgTable(
  'ai_planner_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('draft'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('ai_planner_drafts_account_uidx').on(table.accountId)],
);

export const aiPlannerItems = pgTable(
  'ai_planner_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => aiPlannerDrafts.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    payload: jsonb('payload').notNull(),
  },
  (table) => [uniqueIndex('ai_planner_items_draft_ordinal_uidx').on(table.draftId, table.ordinal)],
);

export const externalCalendarConnections = pgTable(
  'external_calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    syncDirection: text('sync_direction').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('external_calendar_connections_account_uidx').on(table.accountId)],
);

export const externalEventLinks = pgTable(
  'external_event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => externalCalendarConnections.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references(() => missionOccurrences.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id').notNull(),
    recurrenceScope: text('recurrence_scope').notNull().default('event'),
  },
  (table) => [
    uniqueIndex('external_event_links_provider_scope_uidx').on(
      table.connectionId,
      table.providerEventId,
      table.recurrenceScope,
    ),
    index('external_event_links_occurrence_idx').on(table.occurrenceId),
  ],
);

export const hiddenExternalEvents = pgTable(
  'hidden_external_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => externalCalendarConnections.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id').notNull(),
    recurrenceScope: text('recurrence_scope').notNull().default('event'),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hidden_external_events_provider_scope_uidx').on(
      table.connectionId,
      table.providerEventId,
      table.recurrenceScope,
    ),
    index('hidden_external_events_account_idx').on(table.accountId),
  ],
);

export const calendarSyncCursors = pgTable('calendar_sync_cursors', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => externalCalendarConnections.id, { onDelete: 'cascade' }),
  cursor: text('cursor').notNull(),
  updatedAt: updatedAt(),
});

export const deviceSyncMutations = pgTable(
  'device_sync_mutations',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    operation: text('operation').notNull(),
    baseVersion: integer('base_version'),
    clientOccurredAt: timestamp('client_occurred_at', { withTimezone: true }).notNull(),
    serverReceiptTime: timestamp('server_receipt_time', { withTimezone: true }).notNull(),
    effectiveTime: timestamp('effective_time', { withTimezone: true }).notNull(),
    validationResult: text('validation_result').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('device_sync_mutations_account_idx').on(table.accountId),
    index('device_sync_mutations_device_idx').on(table.deviceId),
  ],
);

export const accountChangeLog = pgTable(
  'account_change_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    operation: text('operation').notNull(),
    payload: jsonb('payload'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('account_change_log_account_sequence_uidx').on(table.accountId, table.sequence),
  ],
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    storageKey: text('storage_key').notNull(),
    deletionDueAt: timestamp('deletion_due_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('media_assets_account_idx').on(table.accountId),
    index('media_assets_deletion_due_idx').on(table.deletionDueAt),
  ],
);

export const feedbackReports = pgTable(
  'feedback_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    email: text('email'),
    description: text('description').notNull(),
    technicalDetails: jsonb('technical_details'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedback_reports_account_idx').on(table.accountId)],
);

export const feedbackMediaAssets = pgTable(
  'feedback_media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackReportId: uuid('feedback_report_id')
      .notNull()
      .references(() => feedbackReports.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('feedback_media_assets_report_idx').on(table.feedbackReportId)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id'),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimToken: uuid('claim_token'),
    lastFailureClass: text('last_failure_class'),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('outbox_events_account_idx').on(table.accountId),
    index('outbox_events_processed_available_idx').on(table.processedAt, table.availableAt),
    index('outbox_events_dispatch_idx').on(
      table.processedAt,
      table.deadLetteredAt,
      table.availableAt,
      table.claimedAt,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('idempotency_keys_account_key_uidx').on(table.accountId, table.key)],
);

export const coreTables = Object.freeze([
  accounts,
  accountSessions,
  devices,
  userSettings,
  missionSeries,
  missionOccurrences,
  missionOccurrenceTombstones,
  missionPersonalNotes,
  missionCompletions,
  evidenceAttempts,
  rewardLedger,
  streakDays,
  storyDrafts,
  storyImageVersions,
  storyCompositions,
  storyStyleProfiles,
  aiPlannerDrafts,
  aiPlannerItems,
  externalCalendarConnections,
  externalEventLinks,
  hiddenExternalEvents,
  calendarSyncCursors,
  deviceSyncMutations,
  accountChangeLog,
  mediaAssets,
  feedbackReports,
  feedbackMediaAssets,
  outboxEvents,
  idempotencyKeys,
] as const);

export const coreTableNames = Object.freeze(coreTables.map((table) => getTableName(table)));

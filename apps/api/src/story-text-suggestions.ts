import {
  storyTextSuggestionsAiOutputSchema,
  storyTextSuggestionsGatewayRequestSchema,
  type StoryTextSuggestionsResult,
} from '@misyra/contracts';
import type { Pool, QueryResultRow } from 'pg';

import type { AiGateway } from './ai-gateway.js';

interface StoryTextSuggestionContextRow extends QueryResultRow {
  missionTitle: string;
  providerTaskDetails: string | null;
  localStart: string;
  localFinish: string;
  timeZone: string;
  timeBehavior: string;
  personalNote: string | null;
  completionType:
    | 'verified_on_time'
    | 'verified_late'
    | 'self_confirmed'
    | 'private'
    | 'trust_mode';
  appLanguage: 'en' | 'zh-HK';
  styleProfile: Record<string, unknown> | null;
}

export class StoryTextSuggestionUnsafeClaimError extends Error {
  constructor() {
    super('Story text suggestion contains an unsupported verification claim.');
    this.name = 'StoryTextSuggestionUnsafeClaimError';
  }
}

export class StoryTextSuggestionContextError extends Error {
  constructor() {
    super('Story text suggestion context is unavailable.');
    this.name = 'StoryTextSuggestionContextError';
  }
}

const UNSAFE_VERIFICATION_CLAIM =
  /\b(?:ai[ -]?verified|verified by ai|verified|verification|evidence accepted|proof accepted)\b|(?:已驗證|驗證通過|證據已接受)/iu;

function mayClaimVerification(
  completionType: StoryTextSuggestionContextRow['completionType'],
): boolean {
  return completionType === 'verified_on_time' || completionType === 'verified_late';
}

function containsUnsafeClaim(result: StoryTextSuggestionsResult): boolean {
  const values = [
    result.headline,
    result.supportingText,
    result.sharingNotes.musicMood,
    result.sharingNotes.mention,
    result.sharingNotes.location,
    result.sharingNotes.poll?.question ?? null,
    ...(result.sharingNotes.poll?.options ?? []),
  ];
  return values.some((value) => value !== null && UNSAFE_VERIFICATION_CLAIM.test(value));
}

export function createStoryTextSuggestionService(input: {
  readonly pool: Pool;
  readonly gateway: Pick<AiGateway, 'suggestStoryText'>;
}) {
  return Object.freeze({
    async suggest(accountId: string, occurrenceId: string): Promise<StoryTextSuggestionsResult> {
      const context = await input.pool.query<StoryTextSuggestionContextRow>(
        `SELECT
           s.title AS "missionTitle",
           o.notes AS "providerTaskDetails",
           o.local_start AS "localStart",
           o.local_finish AS "localFinish",
           o.time_zone AS "timeZone",
           o.time_behavior AS "timeBehavior",
           pn.note AS "personalNote",
           c.completion_type AS "completionType",
           settings.language AS "appLanguage",
           style.profile AS "styleProfile"
         FROM mission_occurrences o
         JOIN mission_series s
           ON s.id = o.series_id AND s.account_id = o.account_id
         JOIN mission_completions c
           ON c.occurrence_id = o.id AND c.account_id = o.account_id
         JOIN user_settings settings
           ON settings.account_id = o.account_id
         LEFT JOIN mission_personal_notes pn
           ON pn.occurrence_id = o.id AND pn.account_id = o.account_id
         LEFT JOIN story_style_profiles style
           ON style.account_id = o.account_id
         WHERE o.account_id = $1
           AND o.id = $2
           AND o.completion_state = 'completed'
           AND o.deletion_state = 'active'`,
        [accountId, occurrenceId],
      );
      const row = context.rows[0];
      if (row === undefined) throw new StoryTextSuggestionContextError();

      const claimPolicy = { mayClaimVerification: mayClaimVerification(row.completionType) };
      const request = storyTextSuggestionsGatewayRequestSchema.parse({
        missionContext: {
          missionTitle: row.missionTitle,
          providerTaskDetails: row.providerTaskDetails,
          scheduleContext: `${row.localStart} → ${row.localFinish} · ${row.timeZone} · ${row.timeBehavior}`,
          personalNote: row.personalNote,
        },
        completionType: row.completionType,
        appLanguage: row.appLanguage,
        styleProfile: row.styleProfile,
        claimPolicy,
      });

      const result = storyTextSuggestionsAiOutputSchema.parse(
        await input.gateway.suggestStoryText(request),
      );

      if (!claimPolicy.mayClaimVerification && containsUnsafeClaim(result)) {
        throw new StoryTextSuggestionUnsafeClaimError();
      }
      return result;
    },
  });
}

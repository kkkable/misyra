import { z } from 'zod';

import { storyTextMissionContextSchema } from '../external-calendar.js';
import { authoritativeCompletionTypeSchema } from './completion.js';

const nullableSuggestionTextSchema = z.string().trim().min(1).nullable();

export const storyTextSharingPollSchema = z
  .object({
    question: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(2).max(4),
  })
  .strict();

export const storyTextSharingNotesSuggestionSchema = z
  .object({
    musicMood: nullableSuggestionTextSchema,
    mention: nullableSuggestionTextSchema,
    location: nullableSuggestionTextSchema,
    poll: storyTextSharingPollSchema.nullable(),
  })
  .strict();

export const storyTextSuggestionsAiOutputSchema = z
  .object({
    headline: nullableSuggestionTextSchema,
    supportingText: nullableSuggestionTextSchema,
    sharingNotes: storyTextSharingNotesSuggestionSchema,
  })
  .strict();

export const storyTextSuggestionsGatewayRequestSchema = z
  .object({
    missionContext: storyTextMissionContextSchema,
    completionType: authoritativeCompletionTypeSchema,
    appLanguage: z.enum(['en', 'zh-HK']),
    styleProfile: z.record(z.string(), z.unknown()).nullable(),
    claimPolicy: z
      .object({
        mayClaimVerification: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const storyTextSuggestionsResultSchema = storyTextSuggestionsAiOutputSchema;

export type StoryTextSuggestionsGatewayRequest = z.infer<
  typeof storyTextSuggestionsGatewayRequestSchema
>;
export type StoryTextSuggestionsAiOutput = z.infer<typeof storyTextSuggestionsAiOutputSchema>;
export type StoryTextSuggestionsResult = z.infer<typeof storyTextSuggestionsResultSchema>;

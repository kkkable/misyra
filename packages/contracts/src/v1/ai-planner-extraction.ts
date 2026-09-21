import { z } from 'zod';

const MAX_PLANNER_TEXT_CHARACTERS = 2_000;
const MAX_PLANNER_IMAGES = 3;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const plannerTextSchema = z.string().refine(
  (value) => Array.from(value).length <= MAX_PLANNER_TEXT_CHARACTERS,
  'Planner extraction text cannot exceed 2,000 characters',
);
const plannerImageAssetIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_PLANNER_IMAGES)
  .refine((ids) => new Set(ids).size === ids.length, 'Planner image asset ids must be unique');
const appTimeZoneSchema = z.string().min(1).refine(isValidTimeZone, 'Invalid IANA time zone');
const plannerLocaleSchema = z.enum(['en', 'zh-HK']);
const localDateSchema = z.string().refine(isValidLocalDate, 'Invalid local date');
const localTimeSchema = z.string().regex(LOCAL_TIME_PATTERN, 'Invalid local time');
const nullableTextSchema = z.string().trim().min(1).nullable();

export const plannerExtractionInputSchema = z
  .object({
    text: plannerTextSchema.optional(),
    imageAssetIds: plannerImageAssetIdsSchema,
    appTimeZone: appTimeZoneSchema,
    locale: plannerLocaleSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const hasText = value.text !== undefined && value.text.trim().length > 0;
    if (!hasText && value.imageAssetIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Planner extraction requires text or at least one image',
      });
    }
  });

export const plannerExtractionGatewayRequestSchema = z
  .object({
    input: plannerExtractionInputSchema,
    systemPrompt: z.string().min(1),
  })
  .strict();

export const plannerExtractionProviderCandidateSchema = z
  .object({
    disposition: z.enum(['include', 'omit_uncertain']),
    title: nullableTextSchema,
    localDate: localDateSchema.nullable(),
    startLocalTime: localTimeSchema.nullable().optional(),
    endLocalTime: localTimeSchema.nullable().optional(),
    allDay: z.boolean(),
    estimatedMinutes: z.number().int().positive().nullable(),
    location: nullableTextSchema.optional(),
    notes: nullableTextSchema.optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const plannerExtractionProviderOutputSchema = z
  .object({
    candidates: z.array(plannerExtractionProviderCandidateSchema),
  })
  .strict();

export const plannerExtractionItemSchema = z
  .object({
    title: z.string().trim().min(1),
    localDate: localDateSchema,
    startLocalTime: localTimeSchema.optional(),
    endLocalTime: localTimeSchema.optional(),
    allDay: z.boolean(),
    estimatedMinutes: z.number().int().positive(),
    location: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const plannerExtractionResultSchema = z
  .object({
    items: z.array(plannerExtractionItemSchema),
    omittedUncertainContent: z.boolean(),
  })
  .strict();

export type PlannerExtractionInput = z.infer<typeof plannerExtractionInputSchema>;
export type PlannerExtractionGatewayRequest = z.infer<typeof plannerExtractionGatewayRequestSchema>;
export type PlannerExtractionProviderOutput = z.infer<
  typeof plannerExtractionProviderOutputSchema
>;
export type PlannerExtractionProviderCandidate = z.infer<
  typeof plannerExtractionProviderCandidateSchema
>;
export type PlannerExtractionItem = z.infer<typeof plannerExtractionItemSchema>;
export type PlannerExtractionResult = z.infer<typeof plannerExtractionResultSchema>;

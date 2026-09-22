import {
  plannerExtractionInputSchema,
  plannerExtractionResultSchema,
  type PlannerExtractionInput,
  type PlannerExtractionResult,
} from '@misyra/contracts';

export type PlannerConfirmationResponse = Readonly<{
  missionCount: number;
  calendarDate: string;
  occurrenceIds: readonly string[];
}>;

type PlannerApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('planner_request_failed');
  }
  return value.payload;
}

function parseConfirmation(value: unknown): PlannerConfirmationResponse {
  if (!isRecord(value)) throw new Error('planner_confirmation_invalid');
  if (
    !Number.isSafeInteger(value.missionCount) ||
    (value.missionCount as number) <= 0 ||
    typeof value.calendarDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.calendarDate) ||
    !Array.isArray(value.occurrenceIds) ||
    value.occurrenceIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error('planner_confirmation_invalid');
  }
  return Object.freeze({
    missionCount: value.missionCount as number,
    calendarDate: value.calendarDate,
    occurrenceIds: Object.freeze(value.occurrenceIds as string[]),
  });
}

export function createPlannerApi({ baseUrl, accessToken }: PlannerApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const authorization = `Bearer ${accessToken}`;

  const post = async (path: string, body: unknown): Promise<unknown> => {
    const response = await fetch(`${root}${path}`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json();
    if (!response.ok) throw new Error('planner_request_failed');
    return payloadFromEnvelope(responseBody);
  };

  return Object.freeze({
    async extract(
      draftId: string,
      input: PlannerExtractionInput,
    ): Promise<PlannerExtractionResult> {
      const validated = plannerExtractionInputSchema.parse(input);
      return plannerExtractionResultSchema.parse(
        await post(`/v1/ai-planner/drafts/${encodeURIComponent(draftId)}/extract`, validated),
      );
    },
    async confirm(
      draftId: string,
      idempotencyKey: string,
    ): Promise<PlannerConfirmationResponse> {
      return parseConfirmation(
        await post(`/v1/ai-planner/drafts/${encodeURIComponent(draftId)}/confirm`, {
          idempotencyKey,
        }),
      );
    },
  });
}

export type PlannerApi = ReturnType<typeof createPlannerApi>;

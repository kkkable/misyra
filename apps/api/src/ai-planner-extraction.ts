import {
  plannerExtractionGatewayRequestSchema,
  plannerExtractionInputSchema,
  plannerExtractionProviderOutputSchema,
  plannerExtractionResultSchema,
  type PlannerExtractionInput,
  type PlannerExtractionItem,
  type PlannerExtractionProviderCandidate,
  type PlannerExtractionResult,
} from '@misyra/contracts';
import { DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES } from '@misyra/domain';

import type { AiGateway } from './ai-gateway.js';

export const PLANNER_EXTRACTION_SYSTEM_PROMPT = [
  'Extract schedule information only.',
  'Return one structured response and never ask follow-up questions.',
  "Preserve the user's order. Do not rearrange or optimize the schedule.",
  'Do not judge lifestyle or schedule density. Do not add breaks.',
  'Use the supplied app time zone for local dates and times.',
  'Omit highly uncertain candidates instead of inventing details.',
  'Use a 30-minute default when duration or all-day effort is missing and that default is reasonable.',
  'Mark omitted uncertain content so the caller can show a partial-import indicator.',
].join('\n');

export class PlannerExtractionInvalidOutputError extends Error {
  constructor() {
    super('Planner extraction provider output is invalid.');
    this.name = 'PlannerExtractionInvalidOutputError';
  }
}

function minutesSinceMidnight(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  if (hour === undefined || minute === undefined) {
    throw new PlannerExtractionInvalidOutputError();
  }
  return hour * 60 + minute;
}

function normalizeIncludedCandidate(
  candidate: PlannerExtractionProviderCandidate,
): PlannerExtractionItem {
  if (candidate.title === null || candidate.localDate === null) {
    throw new PlannerExtractionInvalidOutputError();
  }

  const startLocalTime = candidate.startLocalTime ?? undefined;
  const endLocalTime = candidate.endLocalTime ?? undefined;
  if (candidate.allDay && (startLocalTime !== undefined || endLocalTime !== undefined)) {
    throw new PlannerExtractionInvalidOutputError();
  }
  if (!candidate.allDay && startLocalTime === undefined) {
    throw new PlannerExtractionInvalidOutputError();
  }

  const derivedDuration =
    !candidate.allDay && startLocalTime !== undefined && endLocalTime !== undefined
      ? minutesSinceMidnight(endLocalTime) - minutesSinceMidnight(startLocalTime)
      : null;
  if (derivedDuration !== null && derivedDuration <= 0) {
    throw new PlannerExtractionInvalidOutputError();
  }
  if (
    derivedDuration !== null &&
    candidate.estimatedMinutes !== null &&
    candidate.estimatedMinutes !== derivedDuration
  ) {
    throw new PlannerExtractionInvalidOutputError();
  }

  let estimatedMinutes = candidate.estimatedMinutes ?? undefined;
  if (estimatedMinutes === undefined) {
    if (candidate.allDay) {
      estimatedMinutes = DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES;
    } else if (startLocalTime !== undefined && endLocalTime === undefined) {
      estimatedMinutes = 30;
    } else if (derivedDuration !== null) {
      estimatedMinutes = derivedDuration;
    } else {
      throw new PlannerExtractionInvalidOutputError();
    }
  }

  const item: PlannerExtractionItem = {
    title: candidate.title,
    localDate: candidate.localDate,
    allDay: candidate.allDay,
    estimatedMinutes,
    confidence: candidate.confidence,
    ...(startLocalTime === undefined ? {} : { startLocalTime }),
    ...(endLocalTime === undefined ? {} : { endLocalTime }),
    ...(candidate.location === undefined || candidate.location === null
      ? {}
      : { location: candidate.location }),
    ...(candidate.notes === undefined || candidate.notes === null
      ? {}
      : { notes: candidate.notes }),
  };
  return item;
}

export function createPlannerExtractionService(input: {
  readonly gateway: Pick<AiGateway, 'extractPlannerSchedule'>;
}) {
  return Object.freeze({
    async extract(request: PlannerExtractionInput): Promise<PlannerExtractionResult> {
      const validatedInput = plannerExtractionInputSchema.parse(request);
      const gatewayRequest = plannerExtractionGatewayRequestSchema.parse({
        input: validatedInput,
        systemPrompt: PLANNER_EXTRACTION_SYSTEM_PROMPT,
      });
      const providerOutput = await input.gateway.extractPlannerSchedule(gatewayRequest);
      const parsed = plannerExtractionProviderOutputSchema.safeParse(providerOutput);
      if (!parsed.success) throw new PlannerExtractionInvalidOutputError();

      const items: PlannerExtractionItem[] = [];
      let omittedUncertainContent = parsed.data.omittedUncertainContent;
      for (const candidate of parsed.data.candidates) {
        if (candidate.disposition === 'omit_uncertain') {
          omittedUncertainContent = true;
          continue;
        }
        items.push(normalizeIncludedCandidate(candidate));
      }

      return plannerExtractionResultSchema.parse({
        items,
        omittedUncertainContent,
      });
    },
  });
}

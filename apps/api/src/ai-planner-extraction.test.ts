import type { PlannerExtractionGatewayRequest } from '@misyra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  PLANNER_EXTRACTION_SYSTEM_PROMPT,
  PlannerExtractionInvalidOutputError,
  createPlannerExtractionService,
} from './ai-planner-extraction.js';

const input = {
  text: 'Lunch tomorrow at 12:30. Maybe gym after.',
  imageAssetIds: [],
  appTimeZone: 'Asia/Hong_Kong',
  locale: 'en',
} as const;

describe('MTS-087 schedule extraction gateway', () => {
  it(
    'locks the extraction-only prompt boundary with no optimization or clarification conversation',
    () => {
      expect(PLANNER_EXTRACTION_SYSTEM_PROMPT).toMatchInlineSnapshot(`
        "Extract schedule information only.
        Return one structured response and never ask follow-up questions.
        Preserve the user's order. Do not rearrange or optimize the schedule.
        Do not judge lifestyle or schedule density. Do not add breaks.
        Use the supplied app time zone for local dates and times.
        Omit highly uncertain candidates instead of inventing details.
        For a timed item with a known start and no reasonable duration, a 30-minute duration may be used.
        Mark omitted uncertain content so the caller can show a partial-import indicator."
      `);
    },
  );

  it(
    'omits uncertain candidates, keeps source order, and defaults a reasonable missing timed duration to 30 minutes',
    async () => {
      const extractPlannerSchedule = vi.fn((request: PlannerExtractionGatewayRequest) => {
        expect(request).toEqual({
          input,
          systemPrompt: PLANNER_EXTRACTION_SYSTEM_PROMPT,
        });
        return Promise.resolve({
          candidates: [
            {
              disposition: 'include',
              title: 'Lunch',
              localDate: '2026-09-22',
              startLocalTime: '12:30',
              allDay: false,
              estimatedMinutes: null,
              location: null,
              notes: null,
              confidence: 0.92,
            },
            {
              disposition: 'omit_uncertain',
              title: 'Maybe gym',
              localDate: null,
              startLocalTime: null,
              allDay: false,
              estimatedMinutes: null,
              location: null,
              notes: null,
              confidence: 0.2,
            },
          ],
        });
      });
      const service = createPlannerExtractionService({
        gateway: { extractPlannerSchedule },
      });

      await expect(service.extract(input)).resolves.toEqual({
        items: [
          {
            title: 'Lunch',
            localDate: '2026-09-22',
            startLocalTime: '12:30',
            allDay: false,
            estimatedMinutes: 30,
            confidence: 0.92,
          },
        ],
        omittedUncertainContent: true,
      });
      expect(extractPlannerSchedule).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'derives duration from a reasonable same-day start/end pair without inventing extra schedule items',
    async () => {
      const service = createPlannerExtractionService({
        gateway: {
          extractPlannerSchedule() {
            return Promise.resolve({
              candidates: [
                {
                  disposition: 'include',
                  title: 'Train',
                  localDate: '2026-09-22',
                  startLocalTime: '09:10',
                  endLocalTime: '10:25',
                  allDay: false,
                  estimatedMinutes: null,
                  location: 'Shenzhen Station',
                  notes: null,
                  confidence: 0.98,
                },
              ],
            });
          },
        },
      });

      await expect(service.extract(input)).resolves.toEqual({
        items: [
          {
            title: 'Train',
            localDate: '2026-09-22',
            startLocalTime: '09:10',
            endLocalTime: '10:25',
            allDay: false,
            estimatedMinutes: 75,
            location: 'Shenzhen Station',
            confidence: 0.98,
          },
        ],
        omittedUncertainContent: false,
      });
    },
  );

  it(
    'rejects malformed provider output instead of producing or activating missions',
    async () => {
      const service = createPlannerExtractionService({
        gateway: {
          extractPlannerSchedule() {
            return Promise.resolve({
              candidates: [
                {
                  disposition: 'include',
                  title: 'Bad item',
                  localDate: 'not-a-date',
                  allDay: false,
                  estimatedMinutes: -5,
                  confidence: 2,
                },
              ],
              activateMissions: true,
            });
          },
        },
      });

      await expect(service.extract(input)).rejects.toBeInstanceOf(
        PlannerExtractionInvalidOutputError,
      );
    },
  );
});

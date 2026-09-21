import type { PlannerExtractionGatewayRequest, PlannerExtractionInput } from '@misyra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  PLANNER_EXTRACTION_SYSTEM_PROMPT,
  PlannerExtractionInvalidOutputError,
  createPlannerExtractionService,
} from './ai-planner-extraction.js';

const input: PlannerExtractionInput = {
  text: 'Lunch tomorrow at 12:30. Maybe gym after.',
  imageAssetIds: [],
  appTimeZone: 'Asia/Hong_Kong',
  locale: 'en',
};

describe('MTS-087 schedule extraction gateway', () => {
  it('snapshots extraction-only prompt rules', () => {
    const expectedPrompt = [
      'Extract schedule information only.',
      'Return one structured response and never ask follow-up questions.',
      "Preserve the user's order. Do not rearrange or optimize the schedule.",
      'Do not judge lifestyle or schedule density. Do not add breaks.',
      'Use the supplied app time zone for local dates and times.',
      'Omit highly uncertain candidates instead of inventing details.',
      'Use a 30-minute default when duration or all-day effort is missing and that default is reasonable.',
      'Mark omitted uncertain content so the caller can show a partial-import indicator.',
    ].join('\n');

    expect(PLANNER_EXTRACTION_SYSTEM_PROMPT).toBe(expectedPrompt);
    expect(PLANNER_EXTRACTION_SYSTEM_PROMPT).toMatchInlineSnapshot(`
      "Extract schedule information only.
      Return one structured response and never ask follow-up questions.
      Preserve the user's order. Do not rearrange or optimize the schedule.
      Do not judge lifestyle or schedule density. Do not add breaks.
      Use the supplied app time zone for local dates and times.
      Omit highly uncertain candidates instead of inventing details.
      Use a 30-minute default when duration or all-day effort is missing and that default is reasonable.
      Mark omitted uncertain content so the caller can show a partial-import indicator."
    `);
  });

  it('omits uncertainty and defaults a timed duration', async () => {
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
        omittedUncertainContent: false,
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
  });

  it('derives same-day duration without extra items', async () => {
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
            omittedUncertainContent: false,
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
  });

  it('surfaces partial import when an included item omits an uncertain field', async () => {
    const service = createPlannerExtractionService({
      gateway: {
        extractPlannerSchedule() {
          return Promise.resolve({
            candidates: [
              {
                disposition: 'include',
                title: 'Dinner',
                localDate: '2026-09-22',
                startLocalTime: '19:00',
                allDay: false,
                estimatedMinutes: 60,
                location: null,
                notes: null,
                confidence: 0.88,
              },
            ],
            omittedUncertainContent: true,
          });
        },
      },
    });

    await expect(service.extract(input)).resolves.toEqual({
      items: [
        {
          title: 'Dinner',
          localDate: '2026-09-22',
          startLocalTime: '19:00',
          allDay: false,
          estimatedMinutes: 60,
          confidence: 0.88,
        },
      ],
      omittedUncertainContent: true,
    });
  });

  it('defaults an all-day item with insufficient effort detail to 30 minutes', async () => {
    const service = createPlannerExtractionService({
      gateway: {
        extractPlannerSchedule() {
          return Promise.resolve({
            candidates: [
              {
                disposition: 'include',
                title: 'Conference day',
                localDate: '2026-09-23',
                allDay: true,
                estimatedMinutes: null,
                location: null,
                notes: null,
                confidence: 0.91,
              },
            ],
            omittedUncertainContent: false,
          });
        },
      },
    });

    await expect(service.extract(input)).resolves.toEqual({
      items: [
        {
          title: 'Conference day',
          localDate: '2026-09-23',
          allDay: true,
          estimatedMinutes: 30,
          confidence: 0.91,
        },
      ],
      omittedUncertainContent: false,
    });
  });

  it('rejects a timed item with no start time', async () => {
    const service = createPlannerExtractionService({
      gateway: {
        extractPlannerSchedule() {
          return Promise.resolve({
            candidates: [
              {
                disposition: 'include',
                title: 'Unscheduled meeting',
                localDate: '2026-09-22',
                allDay: false,
                estimatedMinutes: 30,
                location: null,
                notes: null,
                confidence: 0.8,
              },
            ],
            omittedUncertainContent: false,
          });
        },
      },
    });

    await expect(service.extract(input)).rejects.toBeInstanceOf(
      PlannerExtractionInvalidOutputError,
    );
  });

  it('rejects a duration that contradicts the supplied start/end interval', async () => {
    const service = createPlannerExtractionService({
      gateway: {
        extractPlannerSchedule() {
          return Promise.resolve({
            candidates: [
              {
                disposition: 'include',
                title: 'Conflicting meeting',
                localDate: '2026-09-22',
                startLocalTime: '09:00',
                endLocalTime: '10:00',
                allDay: false,
                estimatedMinutes: 30,
                location: null,
                notes: null,
                confidence: 0.9,
              },
            ],
            omittedUncertainContent: false,
          });
        },
      },
    });

    await expect(service.extract(input)).rejects.toBeInstanceOf(
      PlannerExtractionInvalidOutputError,
    );
  });

  it('rejects an impossible same-day time range even when a duration is supplied', async () => {
    const service = createPlannerExtractionService({
      gateway: {
        extractPlannerSchedule() {
          return Promise.resolve({
            candidates: [
              {
                disposition: 'include',
                title: 'Impossible meeting',
                localDate: '2026-09-22',
                startLocalTime: '10:00',
                endLocalTime: '09:00',
                allDay: false,
                estimatedMinutes: 30,
                location: null,
                notes: null,
                confidence: 0.9,
              },
            ],
            omittedUncertainContent: false,
          });
        },
      },
    });

    await expect(service.extract(input)).rejects.toBeInstanceOf(
      PlannerExtractionInvalidOutputError,
    );
  });

  it('rejects malformed provider output', async () => {
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
            omittedUncertainContent: false,
            activateMissions: true,
          });
        },
      },
    });

    await expect(service.extract(input)).rejects.toBeInstanceOf(
      PlannerExtractionInvalidOutputError,
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  plannerExtractionInputSchema,
  plannerExtractionProviderOutputSchema,
  plannerExtractionResultSchema,
} from './v1/ai-planner-extraction.js';

describe('MTS-087 AI Planner extraction contracts', () => {
  it('accepts only the approved extraction input and enforces text/image limits', () => {
    const valid = {
      text: 'Lunch tomorrow at 12:30',
      imageAssetIds: ['11111111-1111-4111-8111-111111111111'],
      appTimeZone: 'Asia/Hong_Kong',
      locale: 'zh-HK',
    };
    expect(plannerExtractionInputSchema.parse(valid)).toEqual(valid);
    expect(
      plannerExtractionInputSchema.safeParse({
        ...valid,
        text: 'a'.repeat(2_001),
      }).success,
    ).toBe(false);
    expect(
      plannerExtractionInputSchema.safeParse({
        ...valid,
        imageAssetIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      }).success,
    ).toBe(false);
    expect(
      plannerExtractionInputSchema.safeParse({
        text: '',
        imageAssetIds: [],
        appTimeZone: 'Asia/Hong_Kong',
        locale: 'en',
      }).success,
    ).toBe(false);
    expect(
      plannerExtractionInputSchema.safeParse({
        ...valid,
        clarificationQuestion: 'What did you mean?',
      }).success,
    ).toBe(false);
  });

  it('uses a strict provider response shape with explicit uncertain-candidate disposition', () => {
    const output = {
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
    };
    expect(plannerExtractionProviderOutputSchema.parse(output)).toEqual(output);
    expect(
      plannerExtractionProviderOutputSchema.safeParse({
        ...output,
        activateMissions: true,
      }).success,
    ).toBe(false);
  });

  it('keeps the public result limited to extracted items and the partial-import indicator', () => {
    const result = {
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
    };
    expect(plannerExtractionResultSchema.parse(result)).toEqual(result);
    expect(
      plannerExtractionResultSchema.safeParse({
        ...result,
        activateMissions: true,
      }).success,
    ).toBe(false);
  });
});

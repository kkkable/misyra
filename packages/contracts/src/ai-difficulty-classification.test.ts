import { describe, expect, it } from 'vitest';

import {
  difficultyClassificationAiOutputSchema,
  difficultyClassificationGatewayRequestSchema,
  difficultyClassificationResultSchema,
  difficultyClassificationSaveRequestSchema,
} from './v1/ai-difficulty-classification.js';

describe('MTS-056 AI difficulty classification contracts', () => {
  it(
    'accepts only mission task details, duration, and the approved classification dimensions',
    () => {
      const parsed = difficultyClassificationGatewayRequestSchema.parse({
        title: 'Prepare quarterly presentation',
        description: 'Review metrics, build slides, rehearse delivery',
        estimatedDurationMinutes: 90,
        classificationDimensions: [
          'physical_effort',
          'mental_effort',
          'complexity',
          'preparation',
        ],
      });

      expect(parsed.classificationDimensions).toEqual([
        'physical_effort',
        'mental_effort',
        'complexity',
        'preparation',
      ]);
      expect(
        difficultyClassificationGatewayRequestSchema.safeParse({
          ...parsed,
          userHistory: [{ completedMissionCount: 42 }],
        }).success,
      ).toBe(false);
    },
  );

  it('validates hidden difficulty metadata and rejects AI-owned XP fields', () => {
    expect(
      difficultyClassificationAiOutputSchema.parse({
        difficulty: 'hard',
        internalMissionType: 'presentation',
        explanation: 'High preparation and mental complexity.',
        confidence: 0.87,
        modelVersion: 'fake-v1',
      }),
    ).toEqual({
      difficulty: 'hard',
      internalMissionType: 'presentation',
      explanation: 'High preparation and mental complexity.',
      confidence: 0.87,
      modelVersion: 'fake-v1',
    });

    expect(
      difficultyClassificationAiOutputSchema.safeParse({
        difficulty: 'hard',
        internalMissionType: 'presentation',
        explanation: 'High preparation and mental complexity.',
        confidence: 0.87,
        modelVersion: 'fake-v1',
        baseXp: 250,
      }).success,
    ).toBe(false);
    expect(
      difficultyClassificationAiOutputSchema.safeParse({
        difficulty: 'extreme',
        internalMissionType: 'presentation',
        explanation: 'Invalid difficulty.',
        confidence: 0.5,
        modelVersion: 'fake-v1',
      }).success,
    ).toBe(false);
    expect(
      difficultyClassificationAiOutputSchema.safeParse({
        difficulty: 'normal',
        internalMissionType: 'presentation',
        explanation: 'Invalid confidence.',
        confidence: 1.01,
        modelVersion: 'fake-v1',
      }).success,
    ).toBe(false);
  });

  it('requires the deterministic safe fallback shape', () => {
    expect(
      difficultyClassificationResultSchema.parse({
        difficulty: 'normal',
        internalMissionType: null,
        explanation: null,
        confidence: 0,
        modelVersion: 'fallback',
        classificationSource: 'fallback',
      }),
    ).toEqual({
      difficulty: 'normal',
      internalMissionType: null,
      explanation: null,
      confidence: 0,
      modelVersion: 'fallback',
      classificationSource: 'fallback',
    });

    expect(
      difficultyClassificationResultSchema.safeParse({
        difficulty: 'hard',
        internalMissionType: null,
        explanation: null,
        confidence: 0,
        modelVersion: 'fallback',
        classificationSource: 'fallback',
      }).success,
    ).toBe(false);
  });

  it(
    'defines relevant before-start Save inputs without exposing difficulty to the user',
    () => {
      const request = difficultyClassificationSaveRequestSchema.parse({
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['title', 'estimated_duration'],
        task: {
          title: 'Prepare quarterly presentation',
          description: 'Updated task details',
          estimatedDurationMinutes: 120,
        },
      });

      expect(request.changedFields).toEqual(['title', 'estimated_duration']);
      expect(
        difficultyClassificationSaveRequestSchema.safeParse({
          ...request,
          difficulty: 'hard',
        }).success,
      ).toBe(false);
    },
  );
});

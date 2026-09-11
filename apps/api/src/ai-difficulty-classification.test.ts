import { describe, expect, it, vi } from 'vitest';

import {
  createDifficultyClassificationService,
  type AiGateway,
} from './ai-difficulty-classification.js';

const task = {
  title: 'Prepare quarterly presentation',
  description: 'Review metrics, build slides, rehearse delivery',
  estimatedDurationMinutes: 90,
};

describe('MTS-056 AI difficulty classification gateway', () => {
  it('uses a deterministic fake gateway and sends no user history', async () => {
    const classifyDifficulty = vi.fn(async (request) => {
      expect(request).toEqual({
        ...task,
        classificationDimensions: ['physical_effort', 'mental_effort', 'complexity', 'preparation'],
      });
      expect('userHistory' in request).toBe(false);
      return {
        difficulty: 'hard',
        internalMissionType: 'presentation',
        explanation: 'High preparation and mental complexity.',
        confidence: 0.87,
        modelVersion: 'fake-v1',
      };
    });
    const gateway: AiGateway = { classifyDifficulty };
    const service = createDifficultyClassificationService({ gateway });

    await expect(service.classify(task)).resolves.toEqual({
      difficulty: 'hard',
      internalMissionType: 'presentation',
      explanation: 'High preparation and mental complexity.',
      confidence: 0.87,
      modelVersion: 'fake-v1',
      classificationSource: 'ai',
    });
    expect(classifyDifficulty).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid AI output and returns the deterministic safe fallback', async () => {
    const service = createDifficultyClassificationService({
      gateway: {
        async classifyDifficulty() {
          return {
            difficulty: 'hard',
            internalMissionType: 'presentation',
            explanation: 'Provider attempted to control reward.',
            confidence: 0.9,
            modelVersion: 'fake-v1',
            baseXp: 250,
          };
        },
      },
    });

    await expect(service.classify(task)).resolves.toEqual({
      difficulty: 'normal',
      internalMissionType: null,
      explanation: null,
      confidence: 0,
      modelVersion: 'fallback',
      classificationSource: 'fallback',
    });
  });

  it('falls back deterministically when the AI gateway fails', async () => {
    const service = createDifficultyClassificationService({
      gateway: {
        async classifyDifficulty() {
          throw new Error('provider unavailable');
        },
      },
    });

    await expect(service.classify(task)).resolves.toEqual({
      difficulty: 'normal',
      internalMissionType: null,
      explanation: null,
      confidence: 0,
      modelVersion: 'fallback',
      classificationSource: 'fallback',
    });
  });

  it('recalculates only relevant edits saved before start', async () => {
    const classifyDifficulty = vi.fn(async () => ({
      difficulty: 'normal',
      internalMissionType: 'presentation',
      explanation: 'Moderate complexity.',
      confidence: 0.75,
      modelVersion: 'fake-v1',
    }));
    const service = createDifficultyClassificationService({ gateway: { classifyDifficulty } });

    await expect(
      service.classifyBeforeStartSave({
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['description'],
        task,
      }),
    ).resolves.toMatchObject({ recalculated: true, result: { classificationSource: 'ai' } });

    await expect(
      service.classifyBeforeStartSave({
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['schedule'],
        task,
      }),
    ).resolves.toEqual({ recalculated: false, result: null });

    await expect(
      service.classifyBeforeStartSave({
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-12T09:00:00.000Z',
        changedFields: ['estimated_duration'],
        task,
      }),
    ).resolves.toEqual({ recalculated: false, result: null });

    expect(classifyDifficulty).toHaveBeenCalledTimes(1);
  });
});

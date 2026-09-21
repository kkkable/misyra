import { describe, expect, it, vi } from 'vitest';

import {
  MAX_PLANNER_IMAGES,
  MAX_PLANNER_TEXT_CHARACTERS,
  appendPlannerImageAssetIds,
  countPlannerCharacters,
  createAiPlannerDraftInput,
  createPlannerSystemImagePicker,
} from './ai-planner-input.js';

describe('MTS-086 AI Planner input limits', () => {
  it('counts user-visible Unicode code points accurately up to the 2,000-character boundary', () => {
    expect(countPlannerCharacters('')).toBe(0);
    expect(countPlannerCharacters('abc')).toBe(3);
    expect(countPlannerCharacters('任務🙂')).toBe(3);
    expect(countPlannerCharacters('a'.repeat(MAX_PLANNER_TEXT_CHARACTERS))).toBe(2_000);
  });

  it('accepts exactly 2,000 characters and rejects the 2,001st character', () => {
    expect(
      createAiPlannerDraftInput({
        text: 'a'.repeat(MAX_PLANNER_TEXT_CHARACTERS),
        imageAssetIds: [],
      }),
    ).toEqual({
      text: 'a'.repeat(MAX_PLANNER_TEXT_CHARACTERS),
      imageAssetIds: [],
    });

    expect(() =>
      createAiPlannerDraftInput({
        text: 'a'.repeat(MAX_PLANNER_TEXT_CHARACTERS + 1),
        imageAssetIds: [],
      }),
    ).toThrow(/2,000/);
  });

  it('keeps text and up to three images together and blocks a fourth image', () => {
    const firstThree = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ];
    expect(MAX_PLANNER_IMAGES).toBe(3);
    expect(
      createAiPlannerDraftInput({
        text: 'Lunch at 12:30 tomorrow',
        imageAssetIds: firstThree,
      }),
    ).toEqual({
      text: 'Lunch at 12:30 tomorrow',
      imageAssetIds: firstThree,
    });
    expect(appendPlannerImageAssetIds(firstThree.slice(0, 2), [firstThree[2]])).toEqual(
      firstThree,
    );
    expect(() =>
      appendPlannerImageAssetIds(firstThree, ['44444444-4444-4444-8444-444444444444']),
    ).toThrow(/three|3/i);
  });

  it('uses only the injected system image picker and never requests a camera path', async () => {
    const pickFiles = vi.fn(() =>
      Promise.resolve([
        { uri: 'file:///first.jpg', mimeType: 'image/jpeg', name: 'first.jpg' },
        { uri: 'file:///second.png', mimeType: 'image/png', name: 'second.png' },
      ]),
    );
    const picker = createPlannerSystemImagePicker(pickFiles);

    await expect(picker.pickImages()).resolves.toHaveLength(2);
    expect(pickFiles).toHaveBeenCalledTimes(1);
    expect(pickFiles).toHaveBeenCalledWith({
      multipleFiles: true,
      mimeTypes: ['image/*'],
    });
    expect(picker).not.toHaveProperty('capture');
    expect(picker).not.toHaveProperty('camera');
  });
});

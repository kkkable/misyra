import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('./ai-planner-route-screen.tsx', import.meta.url));
const pickerPath = fileURLToPath(
  new URL('./planner-system-image-picker-runtime.ts', import.meta.url),
);
const mediaApiPath = fileURLToPath(new URL('./planner-media-api.ts', import.meta.url));

describe('MTS-086 AI Planner route contract', () => {
  it('uses the system image picker without a camera or broad permission request', () => {
    const picker = readFileSync(pickerPath, 'utf8');
    const route = readFileSync(routePath, 'utf8');

    expect(picker).toMatch(/File\.pickFileAsync/);
    expect(picker).toMatch(/mimeTypes:\s*\['image\/\*'\]/);
    expect(picker).toMatch(/multipleFiles:\s*true/);
    expect(picker).not.toMatch(/camera/i);
    expect(route).not.toMatch(/requestMediaLibraryPermissions/i);
    expect(route).not.toMatch(/expo-camera/);
  });

  it(
    'wires the 2,000-character counter and one-draft local persistence to the Planner screen',
    () => {
      const route = readFileSync(routePath, 'utf8');

      expect(route).toMatch(/MAX_PLANNER_TEXT_CHARACTERS/);
      expect(route).toMatch(/countPlannerCharacters/);
      expect(route).toMatch(/createAiPlannerDraftPersistence/);
      expect(route).toMatch(/\.load\(\)/);
      expect(route).toMatch(/\.save\(next\)/);
    },
  );

  it('uploads selected images only through the protected planner-working media boundary', () => {
    const mediaApi = readFileSync(mediaApiPath, 'utf8');

    expect(mediaApi).toMatch(/purpose:\s*'planner-working'/);
    expect(mediaApi).toMatch(/variant:\s*'original'/);
    expect(mediaApi).toMatch(/upload-authorizations/);
  });
});

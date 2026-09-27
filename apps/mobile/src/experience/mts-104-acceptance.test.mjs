import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createMotionPreference } from './reduce-motion.js';

const mobileRoot = fileURLToPath(new URL('../../', import.meta.url));
const storyEditorPath = fileURLToPath(new URL('../story/story-editor-screen.tsx', import.meta.url));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.expo', 'coverage'].includes(entry.name)) continue;
      files.push(...(await sourceFiles(target)));
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs)$/u.test(entry.name) && !/\.test\./u.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

describe('MTS-104 Reduce Motion acceptance', () => {
  it('snapshots the approved standard and reduced motion policy', () => {
    expect({
      standard: createMotionPreference(false),
      reduced: createMotionPreference(true),
    }).toMatchInlineSnapshot(`
      {
        "reduced": {
          "confetti": false,
          "directDrag": true,
          "directionalMovement": false,
          "essentialLoading": true,
          "movingOutlines": false,
          "staticSuccess": true,
          "transition": "fade",
        },
        "standard": {
          "confetti": true,
          "directDrag": true,
          "directionalMovement": true,
          "essentialLoading": true,
          "movingOutlines": true,
          "staticSuccess": true,
          "transition": "directional",
        },
      }
    `);
  });

  it('wires Story preview/version transitions to the shared motion preference', async () => {
    const source = await readFile(storyEditorPath, 'utf8');

    expect(source).toContain('useMotionPreference');
    expect(source).toContain('story-preview-transition');
    expect(source).toContain('directionalMovement');
  });

  it('keeps interface-sound APIs out of the mobile application', async () => {
    const files = await sourceFiles(mobileRoot);
    const offenders = [];
    const soundApi =
      /from\s+['"]expo-(?:av|audio)['"]|Audio\.(?:Sound|createAsync)|\bplayAsync\s*\(/u;

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (soundApi.test(source)) offenders.push(path.relative(mobileRoot, file));
    }

    expect(offenders).toEqual([]);
  });
});

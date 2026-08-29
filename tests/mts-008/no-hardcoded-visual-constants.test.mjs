import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const screenFiles = [
  'apps/mobile/app/_layout.tsx',
  'apps/mobile/app/(tabs)/_layout.tsx',
  'apps/mobile/app/(tabs)/ai-planner.tsx',
  'apps/mobile/app/(tabs)/index.tsx',
  'apps/mobile/app/(tabs)/progress.tsx',
  'apps/mobile/app/(tabs)/settings.tsx',
];

const colourLiteralPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g;

test('MTS-008 mobile screens contain no hard-coded colours', async () => {
  const violations = [];

  for (const path of screenFiles) {
    const fileUrl = new URL(`../../${path}`, import.meta.url);
    const source = await readFile(fileUrl, 'utf8');

    for (const match of source.matchAll(colourLiteralPattern)) {
      violations.push(`${path}: ${match[0]}`);
    }
  }

  assert.deepEqual(violations, []);
});

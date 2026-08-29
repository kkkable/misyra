import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const mobileAppRoot = new URL('../../apps/mobile/app/', import.meta.url);
const colourLiteralPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g;

const collectRouteFiles = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nestedDirectoryUrl = new URL(`${entry.name}/`, directoryUrl);
      const nestedFiles = await collectRouteFiles(nestedDirectoryUrl);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(new URL(entry.name, directoryUrl));
    }
  }

  return files;
};

test('MTS-008 mobile screens contain no hard-coded colours', async () => {
  const violations = [];

  for (const fileUrl of await collectRouteFiles(mobileAppRoot)) {
    const source = await readFile(fileUrl, 'utf8');

    for (const match of source.matchAll(colourLiteralPattern)) {
      violations.push(`${fileUrl.pathname}: ${match[0]}`);
    }
  }

  assert.deepEqual(violations, []);
});

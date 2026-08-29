import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import test from 'node:test';

const repositoryRoot = new URL('../../', import.meta.url);
const mobileAppRoot = new URL('../../apps/mobile/app/', import.meta.url);
const sourceExtensions = new Set(['.ts', '.tsx']);
const colourLiteralPattern = /(?:#[0-9a-fA-F]{3,8}\b|\brgba?\s*\()/g;
const visualNumberPattern =
  /\b(?:margin(?:Top|Right|Bottom|Left|Horizontal|Vertical)?|padding(?:Top|Right|Bottom|Left|Horizontal|Vertical)?|gap|borderRadius|fontSize|lineHeight|width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|elevation)\s*:\s*-?\d+(?:\.\d+)?\b/g;

const collectSourceFiles = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryUrl)));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryUrl);
    }
  }

  return files;
};

test('MTS-008 mobile screens contain no hard-coded colour or numeric visual constants', async () => {
  const violations = [];

  for (const fileUrl of await collectSourceFiles(mobileAppRoot)) {
    const source = await readFile(fileUrl, 'utf8');
    const matches = [...source.matchAll(colourLiteralPattern), ...source.matchAll(visualNumberPattern)];

    for (const match of matches) {
      violations.push(
        `${relative(repositoryRoot.pathname, fileUrl.pathname)}: ${match[0]} — use @misyra/design-tokens`,
      );
    }
  }

  assert.deepEqual(violations, []);
});

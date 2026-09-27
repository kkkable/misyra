import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const repositoryUrl = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, repositoryUrl), 'utf8');
}

const primaryUiTextModules = [
  'apps/mobile/src/progress/progress-screen.tsx',
  'apps/mobile/src/ai-planner/ai-planner-route-screen.tsx',
  'apps/mobile/src/settings/settings-route.tsx',
  'apps/mobile/src/calendar/calendar-day-screen.tsx',
  'apps/mobile/src/calendar/calendar-all-day.tsx',
  'apps/mobile/src/calendar/calendar-timeline.tsx',
  'apps/mobile/src/calendar/calendar-help-sheet.tsx',
  'apps/mobile/src/calendar/calendar-mission-layout.tsx',
];

test('MTS-102 review correction applies Bold Text to direct primary-screen interface text', async () => {
  const preference = await source('apps/mobile/src/accessibility/bold-text-preference.ts');
  assert.match(preference, /export function SystemText/u);
  assert.match(preference, /systemBoldFontWeight/u);

  for (const path of primaryUiTextModules) {
    const moduleSource = await source(path);
    assert.match(
      moduleSource,
      /SystemText as Text/u,
      `${path} must render direct interface text through SystemText`,
    );
    assert.doesNotMatch(
      moduleSource,
      /\bText\b[\s\S]{0,80}from ['"]react-native['"]/u,
      `${path} must not bypass Bold Text through react-native Text`,
    );
  }
});

test('MTS-102 review correction does not claim fixture-color PNGs as rendered primary-screen screenshots', async () => {
  const screenshotEvidence = await source(
    'tests/mts-012/mts-102-theme-large-text-screenshot.test.mjs',
  );

  assert.doesNotMatch(
    screenshotEvidence,
    /createDeterministicScreenshotDriver/u,
    'fixture-key color PNGs are not rendered UI evidence',
  );
  assert.match(
    screenshotEvidence,
    /mts-102-rendered-primary-surfaces\.test\.mjs/u,
    'closure evidence must point at rendered primary-surface verification',
  );
});


async function sourceFilesUnder(relativeDirectory) {
  const directory = new URL(relativeDirectory, repositoryUrl);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${relativeDirectory}${entry.name}`;
      if (entry.isDirectory()) return sourceFilesUnder(`${relativePath}/`);
      return /\.tsx?$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [relativePath] : [];
    }),
  );
  return nested.flat();
}

test('MTS-102 review correction leaves no production interface Text bypass outside adaptive foundations', async () => {
  const paths = [
    ...(await sourceFilesUnder('apps/mobile/app/')),
    ...(await sourceFilesUnder('apps/mobile/src/')),
  ];
  const allowedNativeText = new Set([
    'apps/mobile/src/accessibility/bold-text-preference.ts',
    'apps/mobile/src/design-system/primitives.tsx',
  ]);

  const bypasses = [];
  for (const path of paths) {
    if (allowedNativeText.has(path)) continue;
    const moduleSource = await source(path);
    if (/import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*['"]react-native['"]/su.test(moduleSource)) {
      bypasses.push(path);
    }
  }

  assert.deepEqual(
    bypasses,
    [],
    `production interface text must use the Bold Text-aware path: ${bypasses.join(', ')}`,
  );
});

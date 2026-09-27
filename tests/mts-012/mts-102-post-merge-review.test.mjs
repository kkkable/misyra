import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

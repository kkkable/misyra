import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryUrl = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, repositoryUrl), 'utf8');
}

const PRIMARY_SURFACES = ['calendar', 'ai-planner', 'progress', 'settings'];

test('MTS-102 visual matrix carries paired light/dark and large-text fixtures for every primary screen', async () => {
  const { visualFixtureMatrix } = await import('../../scripts/visual-regression.mjs');

  for (const surface of PRIMARY_SURFACES) {
    for (const theme of ['light', 'dark']) {
      const themed = visualFixtureMatrix.filter(
        (fixture) =>
          fixture.surface === surface &&
          fixture.theme === theme &&
          fixture.platform === 'ios' &&
          fixture.viewport.width === 393 &&
          fixture.locale === 'en',
      );

      assert.ok(
        themed.some((fixture) => fixture.textSize === 'default'),
        `${surface} is missing its ${theme} default-text fixture`,
      );
      assert.ok(
        themed.some((fixture) => fixture.textSize === 'large'),
        `${surface} is missing its ${theme} large-text fixture`,
      );
    }
  }
});

test('MTS-102 critical design-system text uses semantic Dynamic Type ramps without fixed button heights', async () => {
  const primitives = await source('apps/mobile/src/design-system/primitives.tsx');

  assert.match(
    primitives,
    /dynamicTypeRamp="title3"/u,
    'TopBar title must use the title3 Dynamic Type ramp',
  );
  assert.match(
    primitives,
    /dynamicTypeRamp="body"/u,
    'critical button/row text must use the body Dynamic Type ramp',
  );

  const buttonStyle = /button:\s*\{(?<body>[\s\S]*?)\n\s*\},/u.exec(primitives)?.groups?.body ?? '';
  assert.doesNotMatch(buttonStyle, /(^|\s)height\s*:/u, 'buttons must grow instead of clipping');
  assert.match(buttonStyle, /paddingVertical\s*:/u, 'buttons need vertical padding for large text');
});

test('MTS-102 observes the native Bold Text preference and updates when the setting changes', async () => {
  const boldTextRuntime = await source('apps/mobile/src/accessibility/system-bold-text.ts');

  assert.match(boldTextRuntime, /AccessibilityInfo\.isBoldTextEnabled\(\)/u);
  assert.match(boldTextRuntime, /AccessibilityInfo\.addEventListener\(['"]boldTextChanged['"]/u);
  assert.match(boldTextRuntime, /subscription\.remove\(\)/u);
  assert.match(boldTextRuntime, /Platform\.OS\s*!==\s*['"]ios['"]/u);
});

test('MTS-102 keeps Story canvas typography independent from system text-size and Bold Text state', async () => {
  const editor = await source('apps/mobile/src/story/story-editor-screen.tsx');
  const composition = await source('apps/mobile/src/story/story-composition.ts');

  assert.match(editor, /fontSize:\s*role === 'headline' \? 72 : 44/u);
  assert.match(composition, /width:\s*1080;\s*height:\s*1920/u);
  assert.doesNotMatch(editor, /useSystemBoldText/u);
  assert.doesNotMatch(composition, /fontScale|DynamicType|boldTextEnabled/u);
});

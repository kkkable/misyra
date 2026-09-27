import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const renderedEvidencePath = new URL(
  '../../apps/mobile/src/accessibility/mts-102-rendered-primary-surfaces.test.mjs',
  import.meta.url,
);

test('MTS-102 theme/large-text evidence comes from rendered primary surfaces, not fixture-color PNGs', async () => {
  const renderedEvidence = await readFile(renderedEvidencePath, 'utf8');

  assert.match(renderedEvidence, /react-test-renderer/u);
  assert.match(renderedEvidence, /CalendarDayScreen/u);
  assert.match(renderedEvidence, /AiPlannerRouteScreen/u);
  assert.match(renderedEvidence, /ProgressScreen/u);
  assert.match(renderedEvidence, /SettingsRouteScreen/u);
  assert.match(renderedEvidence, /\.toJSON\(\)/u);
  assert.match(renderedEvidence, /fontScale:\s*2/u);
  assert.doesNotMatch(renderedEvidence, /createDeterministicScreenshotDriver/u);
});

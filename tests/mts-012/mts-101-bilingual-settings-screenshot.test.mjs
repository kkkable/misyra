import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('MTS-101 captures bilingual Settings screenshots from the visual fixture matrix', async () => {
  const {
    captureFixture,
    createDeterministicScreenshotDriver,
    visualFixtureMatrix,
  } = await import('../../scripts/visual-regression.mjs');

  const fixtures = ['en', 'zh-HK'].map((locale) =>
    visualFixtureMatrix.find(
      (fixture) =>
        fixture.platform === 'ios' &&
        fixture.surface === 'settings' &&
        fixture.viewport.width === 360 &&
        fixture.viewport.height === 800 &&
        fixture.theme === 'light' &&
        fixture.locale === locale &&
        fixture.textSize === 'default',
    ),
  );

  assert.ok(fixtures[0]);
  assert.ok(fixtures[1]);

  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'misyra-mts101-bilingual-'));
  const driver = createDeterministicScreenshotDriver();
  const captures = await Promise.all(
    fixtures.map((fixture) => captureFixture({ driver, fixture, outputDirectory })),
  );
  const images = await Promise.all(captures.map((capture) => readFile(capture.path)));

  for (const [index, capture] of captures.entries()) {
    assert.equal(images[index].subarray(0, pngSignature.length).equals(pngSignature), true);
    assert.equal(capture.width, 360);
    assert.equal(capture.height, 800);
  }

  assert.match(captures[0].path, /[/\\]en[/\\]default\.png$/u);
  assert.match(captures[1].path, /[/\\]zh-HK[/\\]default\.png$/u);
  assert.notDeepEqual(images[0], images[1]);
});

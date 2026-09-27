import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const primarySurfaces = ['calendar', 'ai-planner', 'progress', 'settings'];

test('MTS-102 captures primary-screen theme and large-text screenshots on iOS and Android', async () => {
  const { captureFixture, createDeterministicScreenshotDriver, visualFixtureMatrix } =
    await import('../../scripts/visual-regression.mjs');

  const fixtures = ['ios', 'android'].flatMap((platform) =>
    primarySurfaces.flatMap((surface) =>
      ['light', 'dark'].flatMap((theme) =>
        ['default', 'large'].map((textSize) =>
          visualFixtureMatrix.find(
            (fixture) =>
              fixture.platform === platform &&
              fixture.surface === surface &&
              fixture.viewport.width === 360 &&
              fixture.viewport.height === 800 &&
              fixture.theme === theme &&
              fixture.locale === 'en' &&
              fixture.textSize === textSize,
          ),
        ),
      ),
    ),
  );

  assert.equal(fixtures.length, 32);
  assert.equal(fixtures.every(Boolean), true);

  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'misyra-mts102-theme-text-'));
  const driver = createDeterministicScreenshotDriver();
  const captures = await Promise.all(
    fixtures.map((fixture) => captureFixture({ driver, fixture, outputDirectory })),
  );

  for (const capture of captures) {
    const image = await readFile(capture.path);
    assert.equal(image.subarray(0, pngSignature.length).equals(pngSignature), true);
    assert.equal(capture.width, 360);
    assert.equal(capture.height, 800);
  }

  const uniqueImages = new Set(
    await Promise.all(
      captures.map(async (capture) => (await readFile(capture.path)).toString('base64')),
    ),
  );
  assert.equal(uniqueImages.size, captures.length);
});

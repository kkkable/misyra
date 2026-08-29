import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const REQUIRED_SURFACES = [
  'calendar',
  'mission-details',
  'ai-planner',
  'evidence-review-result',
  'story-editor',
  'progress',
  'settings',
  'overlays',
];

const REQUIRED_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
];

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('MTS-012 fixture inventory covers approved surfaces and required visual axes', async () => {
  const { visualFixtureMatrix } = await import('../../scripts/visual-regression.mjs');

  assert.equal(visualFixtureMatrix.length, 256);
  assert.deepEqual([...new Set(visualFixtureMatrix.map(({ platform }) => platform))].sort(), [
    'android',
    'ios',
  ]);
  assert.deepEqual([...new Set(visualFixtureMatrix.map(({ theme }) => theme))].sort(), [
    'dark',
    'light',
  ]);
  assert.deepEqual([...new Set(visualFixtureMatrix.map(({ locale }) => locale))].sort(), [
    'en',
    'zh-HK',
  ]);
  assert.deepEqual([...new Set(visualFixtureMatrix.map(({ textSize }) => textSize))].sort(), [
    'default',
    'large',
  ]);
  assert.deepEqual(
    [...new Set(visualFixtureMatrix.map(({ surface }) => surface))].sort(),
    [...REQUIRED_SURFACES].sort(),
  );

  const viewportKeys = [
    ...new Set(visualFixtureMatrix.map(({ viewport }) => `${viewport.width}x${viewport.height}`)),
  ].sort();
  assert.deepEqual(
    viewportKeys,
    REQUIRED_VIEWPORTS.map(({ width, height }) => `${width}x${height}`).sort(),
  );

  const fixtureKeys = new Set(visualFixtureMatrix.map(({ key }) => key));
  assert.equal(
    fixtureKeys.size,
    visualFixtureMatrix.length,
    'every fixture must have a unique stable key',
  );
});

test('MTS-012 screenshot generation smoke writes a valid PNG at the requested device size', async () => {
  const { captureFixture, createDeterministicScreenshotDriver, visualFixtureMatrix } =
    await import('../../scripts/visual-regression.mjs');

  const fixture = visualFixtureMatrix.find(
    ({ platform, surface, viewport }) =>
      platform === 'android' &&
      surface === 'calendar' &&
      viewport.width === 360 &&
      viewport.height === 800,
  );
  assert.ok(fixture);

  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'misyra-mts012-'));
  try {
    const capture = await captureFixture({
      driver: createDeterministicScreenshotDriver(),
      fixture,
      outputDirectory,
    });

    const image = await readFile(capture.path);
    assert.equal(image.subarray(0, pngSignature.length).equals(pngSignature), true);
    assert.equal(capture.width, 360);
    assert.equal(capture.height, 800);
    assert.equal(capture.platform, 'android');
    assert.match(capture.path, /android/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('MTS-012 baseline guard requires explicit intent and never compares across platforms', async () => {
  const {
    assertComparableFixtures,
    baselinePathFor,
    compareCaptureToBaseline,
    createDeterministicScreenshotDriver,
    captureFixture,
    updateBaseline,
    visualFixtureMatrix,
  } = await import('../../scripts/visual-regression.mjs');

  const androidFixture = visualFixtureMatrix.find(
    ({ platform, surface, viewport }) =>
      platform === 'android' &&
      surface === 'calendar' &&
      viewport.width === 412 &&
      viewport.height === 915,
  );
  const iosFixture = visualFixtureMatrix.find(
    ({ platform, surface, viewport }) =>
      platform === 'ios' &&
      surface === 'calendar' &&
      viewport.width === 412 &&
      viewport.height === 915,
  );
  assert.ok(androidFixture);
  assert.ok(iosFixture);

  assert.doesNotThrow(() => assertComparableFixtures(androidFixture, androidFixture));
  assert.throws(() => assertComparableFixtures(androidFixture, iosFixture), /same platform/i);

  const root = await mkdtemp(path.join(tmpdir(), 'misyra-mts012-baselines-'));
  const captures = await mkdtemp(path.join(tmpdir(), 'misyra-mts012-captures-'));
  try {
    const capture = await captureFixture({
      driver: createDeterministicScreenshotDriver(),
      fixture: androidFixture,
      outputDirectory: captures,
    });

    await assert.rejects(
      updateBaseline({
        capture,
        fixture: androidFixture,
        repositoryRoot: root,
        allowUpdate: false,
        reason: 'intentional token update',
      }),
      /explicit baseline update approval/i,
    );

    await assert.rejects(
      updateBaseline({
        capture,
        fixture: androidFixture,
        repositoryRoot: root,
        allowUpdate: true,
        reason: '',
      }),
      /reason/i,
    );

    const androidBaseline = baselinePathFor(root, androidFixture);
    const iosBaseline = baselinePathFor(root, iosFixture);
    assert.match(androidBaseline, /baselines[/\\]android[/\\]/);
    assert.match(iosBaseline, /baselines[/\\]ios[/\\]/);
    assert.notEqual(androidBaseline, iosBaseline);

    const result = await updateBaseline({
      capture,
      fixture: androidFixture,
      repositoryRoot: root,
      allowUpdate: true,
      reason: 'intentional token update',
    });
    assert.equal(result.baselinePath, androidBaseline);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);

    await assert.rejects(
      compareCaptureToBaseline({
        capture,
        captureFixture: androidFixture,
        baselineFixture: iosFixture,
        repositoryRoot: root,
      }),
      /same platform/i,
    );

    const matchingComparison = await compareCaptureToBaseline({
      capture,
      captureFixture: androidFixture,
      baselineFixture: androidFixture,
      repositoryRoot: root,
    });
    assert.equal(matchingComparison.matches, true);
    assert.equal(matchingComparison.baselinePath, androidBaseline);
    assert.match(matchingComparison.captureSha256, /^[a-f0-9]{64}$/);
    assert.equal(matchingComparison.captureSha256, matchingComparison.baselineSha256);

    const originalCapture = await readFile(capture.path);
    await writeFile(capture.path, Buffer.concat([originalCapture, Buffer.from([0x00])]));

    const changedComparison = await compareCaptureToBaseline({
      capture,
      captureFixture: androidFixture,
      baselineFixture: androidFixture,
      repositoryRoot: root,
    });
    assert.equal(changedComparison.matches, false);
    assert.notEqual(changedComparison.captureSha256, changedComparison.baselineSha256);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(captures, { recursive: true, force: true });
  }
});

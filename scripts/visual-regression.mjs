import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const SURFACES = Object.freeze([
  'calendar',
  'mission-details',
  'ai-planner',
  'evidence-review-result',
  'story-editor',
  'progress',
  'settings',
  'overlays',
]);
const PLATFORMS = Object.freeze(['ios', 'android']);
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 412, height: 915 }),
]);
const THEMES = Object.freeze(['light', 'dark']);
const LOCALES = Object.freeze(['en', 'zh-HK']);
const TEXT_SIZES = Object.freeze(['default', 'large']);

export const visualFixtureMatrix = Object.freeze(
  PLATFORMS.flatMap((platform) =>
    SURFACES.flatMap((surface) =>
      VIEWPORTS.flatMap((viewport) =>
        THEMES.flatMap((theme) =>
          LOCALES.flatMap((locale) =>
            TEXT_SIZES.map((textSize) =>
              Object.freeze({
                key: [
                  platform,
                  surface,
                  `${viewport.width}x${viewport.height}`,
                  theme,
                  locale,
                  textSize,
                ].join('/'),
                locale,
                platform,
                surface,
                textSize,
                theme,
                viewport,
              }),
            ),
          ),
        ),
      ),
    ),
  ),
);

function fixtureSegments(fixture) {
  return [
    fixture.platform,
    fixture.surface,
    `${fixture.viewport.width}x${fixture.viewport.height}`,
    fixture.theme,
    fixture.locale,
    `${fixture.textSize}.png`,
  ];
}

function capturePathFor(outputDirectory, fixture) {
  return path.join(outputDirectory, ...fixtureSegments(fixture));
}

export function baselinePathFor(repositoryRoot, fixture) {
  return path.join(repositoryRoot, 'tests', 'mts-012', 'baselines', ...fixtureSegments(fixture));
}

function assertMatchingCapture(capture, fixture) {
  if (capture.platform !== fixture.platform) {
    throw new Error('Capture platform must match its fixture platform.');
  }
  if (
    capture.width !== fixture.viewport.width ||
    capture.height !== fixture.viewport.height
  ) {
    throw new Error('Capture dimensions must match the fixture viewport.');
  }
}

export async function captureFixture({ driver, fixture, outputDirectory }) {
  if (!driver || typeof driver.capture !== 'function') {
    throw new TypeError('A screenshot driver with capture(fixture) is required.');
  }

  const screenshot = await driver.capture(fixture);
  if (!screenshot || !Buffer.isBuffer(screenshot.png)) {
    throw new TypeError('Screenshot drivers must return a PNG Buffer.');
  }

  const capture = {
    height: screenshot.height,
    platform: fixture.platform,
    width: screenshot.width,
  };
  assertMatchingCapture(capture, fixture);

  const capturePath = capturePathFor(outputDirectory, fixture);
  await mkdir(path.dirname(capturePath), { recursive: true });
  await writeFile(capturePath, screenshot.png);

  return Object.freeze({ ...capture, path: capturePath });
}

export async function updateBaseline({
  allowUpdate,
  capture,
  fixture,
  reason,
  repositoryRoot,
}) {
  if (allowUpdate !== true) {
    throw new Error('Explicit baseline update approval is required.');
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('A non-empty baseline update reason is required.');
  }

  assertMatchingCapture(capture, fixture);
  const baselinePath = baselinePathFor(repositoryRoot, fixture);
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await copyFile(capture.path, baselinePath);

  const image = await readFile(baselinePath);
  return Object.freeze({
    baselinePath,
    reason: reason.trim(),
    sha256: createHash('sha256').update(image).digest('hex'),
  });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function deterministicPng(fixture) {
  const { height, width } = fixture.viewport;
  const digest = createHash('sha256').update(fixture.key).digest();
  const rowBytes = width * 4 + 1;
  const pixels = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowBytes;
    pixels[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      pixels[pixelOffset] = digest[0];
      pixels[pixelOffset + 1] = digest[1];
      pixels[pixelOffset + 2] = digest[2];
      pixels[pixelOffset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createDeterministicScreenshotDriver() {
  return Object.freeze({
    kind: 'deterministic-test-fake',
    async capture(fixture) {
      return Object.freeze({
        height: fixture.viewport.height,
        png: deterministicPng(fixture),
        width: fixture.viewport.width,
      });
    },
  });
}

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PLATFORMS = new Set(['android', 'ios']);
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

export function buildStoryExportDeviceRecord(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('input must be an object');
  }

  const device = requireText(input.device, 'device');
  const platform = requireText(input.platform, 'platform');
  if (!PLATFORMS.has(platform)) {
    throw new TypeError('platform must be android or ios');
  }

  const imageVersionId = requireText(input.imageVersionId, 'imageVersionId');
  if (input.width !== STORY_WIDTH || input.height !== STORY_HEIGHT) {
    throw new TypeError('Story export must be exactly 1080x1920');
  }

  const savedToPhotos = requireBoolean(input.savedToPhotos, 'savedToPhotos');
  const systemShareOpened = requireBoolean(input.systemShareOpened, 'systemShareOpened');
  const notes = input.notes === undefined ? '' : requireText(input.notes, 'notes');

  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    device,
    platform,
    imageVersionId,
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    savedToPhotos,
    systemShareOpened,
    notes,
  };
}

function parseBoolean(value, name) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new TypeError(`${name} must be true or false`);
}

function usage() {
  return [
    'MTS-097 Story export physical-device evidence recorder',
    '',
    'Usage:',
    '  node scripts/mts-097-story-export-device-check.mjs \\',
    '    --device <label> --platform <android|ios> \\',
    '    --image-version-id <id> --width 1080 --height 1920 \\',
    '    --saved-to-photos <true|false> --system-share-opened <true|false> \\',
    '    [--notes <text>] [--output <path>]',
    '',
    'Record one observed Save to Photos and native system-share check on a physical device.',
  ].join('\n');
}

function parseArguments(args) {
  if (args.includes('--help')) return { help: true };

  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (typeof flag !== 'string' || !flag.startsWith('--') || value === undefined) {
      throw new TypeError('arguments must be provided as --flag value pairs');
    }
    values[flag.slice(2)] = value;
  }

  return {
    help: false,
    input: {
      device: values.device,
      platform: values.platform,
      imageVersionId: values['image-version-id'],
      width: Number(values.width),
      height: Number(values.height),
      savedToPhotos: parseBoolean(values['saved-to-photos'], 'saved-to-photos'),
      systemShareOpened: parseBoolean(values['system-share-opened'], 'system-share-opened'),
      notes: values.notes,
    },
    output: values.output,
  };
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const record = buildStoryExportDeviceRecord(parsed.input);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  if (parsed.output === undefined) {
    process.stdout.write(serialized);
    return;
  }

  await writeFile(resolve(parsed.output), serialized, 'utf8');
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage()}\n`);
    process.exitCode = 1;
  });
}

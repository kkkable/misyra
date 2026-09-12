import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EXACT_ACCESS_VALUES = new Set(['granted', 'denied', 'not-required']);

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireInstant(value, name) {
  const text = requireText(value, name);
  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`${name} must be a valid date-time`);
  }
  return { text, timestamp };
}

export function buildAndroidNotificationDeliveryRecord(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('input must be an object');
  }

  const device = requireText(input.device, 'device');
  if (!Number.isInteger(input.androidApi) || input.androidApi <= 0) {
    throw new TypeError('androidApi must be a positive integer');
  }

  const exactAccess = requireText(input.exactAccess, 'exactAccess');
  if (!EXACT_ACCESS_VALUES.has(exactAccess)) {
    throw new TypeError('exactAccess must be granted, denied, or not-required');
  }

  const scheduled = requireInstant(input.scheduledAt, 'scheduledAt');
  const observed = requireInstant(input.observedAt, 'observedAt');
  const notes = input.notes === undefined ? '' : requireText(input.notes, 'notes');

  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    device,
    androidApi: input.androidApi,
    exactAccess,
    deliveryPath: exactAccess === 'granted' ? 'exact-when-available' : 'best-supported-fallback',
    scheduledAt: scheduled.text,
    observedAt: observed.text,
    deliveryDeltaMs: observed.timestamp - scheduled.timestamp,
    notes,
  };
}

function usage() {
  return [
    'MTS-066 Android notification physical-device evidence recorder',
    '',
    'Usage:',
    '  node scripts/mts-066-android-notification-device-check.mjs \\',
    '    --device <label> --android-api <number> \\',
    '    --exact-access <granted|denied|not-required> \\',
    '    --scheduled-at <ISO date-time> --observed-at <ISO date-time> \\',
    '    [--notes <text>] [--output <path>]',
    '',
    'This records observed delivery evidence only. Google Play exact-alarm policy approval remains an external GATE-G release requirement.',
  ].join('\n');
}

function parseArguments(args) {
  if (args.includes('--help')) {
    return { help: true };
  }

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
      androidApi: Number(values['android-api']),
      exactAccess: values['exact-access'],
      scheduledAt: values['scheduled-at'],
      observedAt: values['observed-at'],
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

  const record = buildAndroidNotificationDeliveryRecord(parsed.input);
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

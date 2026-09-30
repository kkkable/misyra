#!/usr/bin/env node
/**
 * MTS-110 mobile secret scan.
 *
 * Two independent checks keep credentials out of the mobile app:
 *   1. scanDirectory(): scans built mobile artifacts (JS bundles, Hermes bytecode, assets) for
 *      credential-shaped strings and server-only environment variable names.
 *   2. checkMobileEnvUsage(): statically proves mobile source only reads public (EXPO_PUBLIC_*) or
 *      explicitly allow-listed build-time variables.
 *
 * Findings never contain the matched value: only file, line, and rule id are reported, so the scan
 * output is safe to paste into logs and pull requests.
 *
 * Usage:
 *   node scripts/mobile-secret-scan.mjs --env-only
 *   node scripts/mobile-secret-scan.mjs <built-artifact-directory>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Variables that only the server, worker, or local infrastructure may read. */
const writeLine = (text) => process.stdout.write(`${text}\n`);
const writeError = (text) => process.stderr.write(`${text}\n`);

export const serverOnlyEnvNames = Object.freeze([
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_SECRET_PREVIOUS',
  'AZURE_STORAGE_ACCOUNT_KEY',
  'AZURE_STORAGE_CONNECTION_STRING',
  'DATABASE_URL',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS',
  'POSTGRES_PASSWORD',
  'TOKEN_ENCRYPTION_KEY',
  'WORKER_SECRET',
  'APPLE_PRIVATE_KEY',
  'OPENAI_API_KEY',
]);

/** Non-public variables that mobile build configuration may legitimately read. */
const allowedNonPublicEnvNames = new Set(['NODE_ENV', 'MISYRA_EVENTKIT_PERMISSION_COPY']);

const rules = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['azure-storage-key', /(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/=]{20,}/],
  ['google-client-secret', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['database-url-credentials', /postgres(?:ql)?:\/\/[^\s:@/'"]+:[^\s@/'"]+@/i],
  ['bearer-token', /Bearer\s+[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  [
    'secret-assignment',
    /\b(?:password|clientSecret|apiKey|accessToken|accountKey|sharedAccessKey|connectionString)\b["']?\s*[:=]\s*["'](?=[^"'\s]{12,}["'])(?=[^"']*[0-9_\-/+=])[^"']+["']/i,
  ],
  ['server-only-env-name', new RegExp(`\\b(?:${serverOnlyEnvNames.join('|')})\\b`)],
];

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/** Scan already-decoded text. Returns `{ file, line, rule }` findings, one per rule per line. */
export function scanText(file, text) {
  const findings = [];
  const seen = new Set();
  for (const [rule, pattern] of rules) {
    const global = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
    for (const match of text.matchAll(global)) {
      const line = lineNumberAt(text, match.index ?? 0);
      const key = `${rule}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ file, line, rule });
    }
  }
  return findings;
}

/** Scan raw bytes: ASCII/UTF-8 strings plus both UTF-16LE alignments (bytecode string tables). */
export function scanBuffer(file, buffer) {
  const decoded = [
    buffer.toString('latin1'),
    buffer.subarray(0, buffer.length - (buffer.length % 2)).toString('utf16le'),
    buffer.subarray(1, buffer.length - ((buffer.length - 1) % 2)).toString('utf16le'),
  ];
  const findings = [];
  const seen = new Set();
  for (const text of decoded) {
    for (const finding of scanText(file, text)) {
      const key = `${finding.rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(finding);
    }
  }
  return findings;
}

function* walk(directory, skip) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (skip(entry.name, entry.isDirectory())) continue;
    if (entry.isDirectory()) yield* walk(path, skip);
    else if (entry.isFile()) yield path;
  }
}

/** Scan every file under a built-artifact directory. */
export function scanDirectory(directory) {
  const findings = [];
  for (const path of walk(directory, () => false)) {
    const file = relative(directory, path).split(sep).join('/');
    findings.push(...scanBuffer(file, readFileSync(path)));
  }
  return findings;
}

const sourceExtensions = /\.(?:[cm]?[jt]sx?|json)$/;
const envReferences =
  /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([^'"]+)['"]\s*\]|(?![.[A-Za-z0-9_]))/g;

/** Statically verify mobile source reads only public or allow-listed environment variables. */
export function checkMobileEnvUsage(mobileDirectory) {
  const violations = [];
  const skip = (name, isDirectory) =>
    isDirectory ? name === 'node_modules' || name === 'dist' || name.startsWith('.') : false;
  for (const path of walk(mobileDirectory, skip)) {
    if (!sourceExtensions.test(path) || /\.test\.[cm]?[jt]sx?$/.test(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(envReferences)) {
      const name = match[1] ?? match[2] ?? '<dynamic>';
      if (name.startsWith('EXPO_PUBLIC_') || allowedNonPublicEnvNames.has(name)) continue;
      violations.push({
        file: relative(mobileDirectory, path).split(sep).join('/'),
        line: lineNumberAt(text, match.index ?? 0),
        name,
      });
    }
  }
  return violations;
}

function main(argv) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const target = argv.find((argument) => !argument.startsWith('--'));
  const envOnly = argv.includes('--env-only');
  if (!envOnly && target === undefined) {
    writeError('Usage: mobile-secret-scan.mjs --env-only | <built-artifact-directory>');
    return 2;
  }
  const envViolations = checkMobileEnvUsage(join(repoRoot, 'apps/mobile'));
  const artifactFindings = envOnly ? [] : scanDirectory(resolve(target));
  for (const violation of envViolations) {
    writeError(
      `mobile-env: ${violation.file}:${violation.line} reads non-public variable ${violation.name}`,
    );
  }
  for (const finding of artifactFindings) {
    writeError(`mobile-artifact: ${finding.file}:${finding.line} matched rule ${finding.rule}`);
  }
  const failures = envViolations.length + artifactFindings.length;
  if (failures === 0) {
    writeLine(
      envOnly ? 'Mobile environment usage is public-only.' : 'Mobile artifacts contain no secrets.',
    );
    return 0;
  }
  return 1;
}

if (
  process.argv[1] !== undefined &&
  statSync(process.argv[1]).isFile() &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}

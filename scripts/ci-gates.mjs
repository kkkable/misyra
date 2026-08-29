import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(path, 'utf8');
}

function gitTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('Unable to enumerate tracked files for CI validation.');
  }
  return result.stdout.split('\0').filter(Boolean);
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized.includes('replace_me') ||
    normalized.includes('replace-me') ||
    normalized.includes('placeholder') ||
    normalized.includes('fixture') ||
    normalized.includes('example.invalid') ||
    normalized.includes('usedevelopmentstorage=true')
  );
}

function validateSecretText(path, source) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
    throw new Error(`${path}: committed private-key material is forbidden`);
  }

  for (const pattern of [
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/,
  ]) {
    if (pattern.test(source)) {
      throw new Error(`${path}: committed token-like material is forbidden`);
    }
  }

  const assignment =
    /\b(?:password|clientSecret|apiKey|accessToken|accountKey|sharedAccessKey|connectionString)\b\s*[:=]\s*["']([^"']*)["']/gi;
  for (const match of source.matchAll(assignment)) {
    if (!isPlaceholder(match[1])) {
      throw new Error(`${path}: committed credential-like value is forbidden`);
    }
  }
}

function runSecrets() {
  const excluded = new Set(['scripts/ci-gates.mjs']);

  for (const path of gitTrackedFiles()) {
    if (excluded.has(path)) continue;
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) continue;
    validateSecretText(path, bytes.toString('utf8'));
  }
}

function parseSupportedLocales(source) {
  const match = source.match(/supportedLocales\s*=\s*\[([^\]]+)\]/);
  if (!match) throw new Error('supportedLocales declaration is missing');
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

function validateLocalizationText(source) {
  const locales = parseSupportedLocales(source);
  assert.deepEqual(
    [...locales].sort(),
    ['en', 'zh-HK'].sort(),
    'localization baseline must contain exactly en and zh-HK',
  );
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, next);
  });
}

function runLocalization() {
  const indexPath = join(root, 'packages', 'localization', 'src', 'index.ts');
  validateLocalizationText(read(indexPath));

  const catalogDir = join(root, 'packages', 'localization', 'src', 'locales');
  const expectedFiles = ['en.json', 'zh-HK.json'];
  for (const file of expectedFiles) {
    const path = join(catalogDir, file);
    if (!existsSync(path)) {
      throw new Error(`localization catalog ${file} is missing`);
    }
  }

  const catalogs = expectedFiles.map((file) => JSON.parse(read(join(catalogDir, file))));
  assert.deepEqual(
    flattenKeys(catalogs[0]).sort(),
    flattenKeys(catalogs[1]).sort(),
    'en and zh-HK localization catalogs must expose identical keys',
  );
}

function validatePrivacyText(path, source) {
  const logCall =
    /\b(?:console|logger|[A-Za-z_$][\w$]*\.log)\.(?:log|info|warn|error|debug|trace)\s*\(([\s\S]*?)\);/g;
  const sensitive =
    /\b(?:body|headers|authorization|token|password|secret|mission|story|evidence|note|content)\b/i;

  for (const match of source.matchAll(logCall)) {
    if (sensitive.test(match[1])) {
      throw new Error(`${path}: content-bearing or credential-bearing logging is forbidden`);
    }
  }
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.(?:c|m)?(?:j|t)sx?$/.test(entry.name) ? [path] : [];
  });
}

function runPrivacy() {
  for (const directory of [join(root, 'apps'), join(root, 'packages')]) {
    for (const absolute of collectSourceFiles(directory)) {
      validatePrivacyText(relative(root, absolute), read(absolute));
    }
  }
}

function validateContractManifest(manifest, exists = () => true) {
  if (!manifest.exports || typeof manifest.exports !== 'object') {
    throw new Error('contracts package must expose explicit exports');
  }
  for (const key of Object.keys(manifest.exports)) {
    if (key.includes('*')) throw new Error('wildcard contract exports are forbidden');
  }
  const entry = manifest.exports['.'];
  if (typeof entry !== 'string' || !entry.startsWith('./')) {
    throw new Error('contracts package root export must be an explicit relative file');
  }
  if (!exists(entry)) throw new Error('contracts package root export target is missing');
}

function exportedSymbols(source) {
  const symbols = new Set();
  const declarations =
    /\bexport\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declarations)) symbols.add(match[1]);

  const namedExports = /\bexport\s*\{([^}]+)\}(?:\s+from\s+["'][^"']+["'])?/g;
  for (const match of source.matchAll(namedExports)) {
    for (const rawEntry of match[1].split(',')) {
      const entry = rawEntry.trim();
      if (!entry) continue;
      const alias = entry.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      const original = entry.match(/^([A-Za-z_$][\w$]*)/);
      const exported = alias?.[1] ?? original?.[1];
      if (exported) symbols.add(exported);
    }
  }

  return symbols;
}

function assertContractExportsCompatible(baseSource, currentSource) {
  const baseExports = exportedSymbols(baseSource);
  const currentExports = exportedSymbols(currentSource);
  for (const symbol of baseExports) {
    if (!currentExports.has(symbol)) {
      throw new Error(`contract compatibility removed exported symbol: ${symbol}`);
    }
  }
}

function gitShow(ref, path) {
  const result = spawnSync('git', ['show', `${ref}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to read contract compatibility baseline ${ref}:${path}`);
  }
  return result.stdout;
}

function runContracts() {
  const packageDir = join(root, 'packages', 'contracts');
  const manifest = JSON.parse(read(join(packageDir, 'package.json')));
  validateContractManifest(manifest, (entry) => existsSync(join(packageDir, entry)));

  const contractPath = 'packages/contracts/src/index.ts';
  const baselineRef = process.env.CI_CONTRACT_BASE_SHA?.trim() || 'HEAD^1';
  const baseSource = gitShow(baselineRef, contractPath);
  const currentSource = read(join(root, contractPath));
  assertContractExportsCompatible(baseSource, currentSource);
}

function expectedFailure(label, action) {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} fixture must fail`);
}

function runSelfTest() {
  expectedFailure('secret', () =>
    validateSecretText('synthetic-secret.txt', 'clientSecret = "opaque-value-12345"'),
  );
  expectedFailure('localization', () =>
    validateLocalizationText("export const supportedLocales = ['en'] as const;"),
  );
  expectedFailure('privacy', () =>
    validatePrivacyText(
      'synthetic.ts',
      `request.log.info({
        body: request.body,
      });`,
    ),
  );
  expectedFailure('contract manifest', () =>
    validateContractManifest({ exports: { './*': './src/*.ts' } }),
  );
  expectedFailure('contract compatibility', () =>
    assertContractExportsCompatible('export const existing = 1;', 'export const replacement = 1;'),
  );
}

const commands = {
  secrets: runSecrets,
  localization: runLocalization,
  privacy: runPrivacy,
  contracts: runContracts,
  'self-test': runSelfTest,
};

const command = process.argv[2];
if (!command || !(command in commands)) {
  process.stderr.write(`Usage: node scripts/ci-gates.mjs ${Object.keys(commands).join('|')}\n`);
  process.exitCode = 2;
} else {
  try {
    commands[command]();
    process.stdout.write(`CI gate passed: ${command}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

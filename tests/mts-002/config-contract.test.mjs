import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const configDir = join(root, 'packages', 'config');

function runPnpm(args) {
  return spawnSync(pnpm, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
}

test('shared TypeScript strict config rejects the intentional type-error fixture', () => {
  const baseConfig = join(configDir, 'tsconfig', 'base.json');
  assert.equal(existsSync(baseConfig), true, 'shared TypeScript base config must exist');

  const result = runPnpm([
    'exec',
    'tsc',
    '--project',
    'tests/mts-002/fixtures/tsconfig.type-error.json',
    '--pretty',
    'false',
  ]);

  assert.notEqual(result.status, 0, 'intentional type-error fixture must fail');
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Type 'string' is not assignable to type 'number'/,
  );
});

test('package-boundary lint fixture rejects cross-package source deep imports', () => {
  const eslintConfig = join(configDir, 'eslint.config.mjs');
  assert.equal(existsSync(eslintConfig), true, 'shared ESLint config must exist');

  const result = runPnpm([
    'exec',
    'eslint',
    'tests/mts-002/fixtures/package-boundary.ts',
    '--no-config-lookup',
    '--config',
    'tests/mts-002/fixtures/eslint-boundary.config.mjs',
  ]);

  assert.notEqual(result.status, 0, 'cross-package deep-import fixture must fail lint');
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Cross-package deep imports are forbidden/,
  );
});

test('configuration package exposes strict, type-aware, deterministic shared configs', async () => {
  const packageJsonPath = join(configDir, 'package.json');
  assert.equal(existsSync(packageJsonPath), true, 'configuration package must exist');

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  assert.deepEqual(Object.keys(packageJson.exports).sort(), [
    './eslint',
    './prettier',
    './typescript',
    './vitest',
  ]);

  const tsconfig = JSON.parse(
    readFileSync(join(configDir, 'tsconfig', 'base.json'), 'utf8'),
  );
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);

  const eslintModule = await import(
    pathToFileURL(join(configDir, 'eslint.config.mjs')).href
  );
  assert.equal(eslintModule.typeAwareParserOptions.projectService, true);
  assert.ok(eslintModule.packageBoundaryRules['no-restricted-imports']);

  const prettierModule = await import(
    pathToFileURL(join(configDir, 'prettier.config.mjs')).href
  );
  assert.equal(prettierModule.default.endOfLine, 'lf');
  assert.equal(prettierModule.default.singleQuote, true);

  const vitestModule = await import(
    pathToFileURL(join(configDir, 'vitest.config.mjs')).href
  );
  assert.equal(vitestModule.default.test.environment, 'node');
  assert.equal(vitestModule.default.test.restoreMocks, true);
});

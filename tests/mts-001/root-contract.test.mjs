import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFile(path.join(repoRoot, p), 'utf8');

async function exists(p) {
  try {
    await access(path.join(repoRoot, p));
    return true;
  } catch {
    return false;
  }
}

test('pins the Node and pnpm toolchain and exposes the required root scripts', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.packageManager, 'pnpm@10.34.5');
  assert.equal(pkg.engines?.node, '>=24 <25');
  for (const name of ['format', 'lint', 'typecheck', 'test', 'build', 'audit', 'validate:infra']) {
    assert.equal(typeof pkg.scripts?.[name], 'string', `missing root script: ${name}`);
    assert.ok(pkg.scripts[name].trim().length > 0, `empty root script: ${name}`);
  }
  assert.equal((await read('.nvmrc')).trim(), '24');
});

test('declares pnpm workspace package boundaries and Turborepo config without duplicate lockfiles', async () => {
  const workspace = await read('pnpm-workspace.yaml');
  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
  const turbo = JSON.parse(await read('turbo.json'));
  assert.equal(turbo.$schema, 'https://turbo.build/schema.json');
  assert.equal(await exists('package-lock.json'), false);
  assert.equal(await exists('npm-shrinkwrap.json'), false);
  assert.equal(await exists('yarn.lock'), false);
});

test('establishes Git hygiene for generated, secret, and local tool state', async () => {
  const gitignore = await read('.gitignore');
  for (const pattern of ['node_modules/', '.turbo/', '.env', '.env.*', '!.env.example']) {
    assert.ok(gitignore.includes(pattern), `missing .gitignore pattern: ${pattern}`);
  }
});

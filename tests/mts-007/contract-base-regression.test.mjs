import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const gateScript = readFileSync(join(root, 'scripts', 'ci-gates.mjs'), 'utf8');

test('contract compatibility uses the pull-request base instead of the previous feature commit', () => {
  assert.match(workflow, /CI_CONTRACT_BASE_SHA/);
  assert.match(workflow, /github\.event\.pull_request\.base\.sha/);
  assert.match(gateScript, /CI_CONTRACT_BASE_SHA/);
  assert.doesNotMatch(gateScript, /gitShow\(['"]HEAD\^1['"]/);
});

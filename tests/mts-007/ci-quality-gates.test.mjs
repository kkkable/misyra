import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowPath = join(root, '.github', 'workflows', 'ci.yml');
const ciGateScriptPath = join(root, 'scripts', 'ci-gates.mjs');
const packageJsonPath = join(root, 'package.json');

function read(path) {
  assert.equal(existsSync(path), true, `${relative(root, path)} must exist`);
  return readFileSync(path, 'utf8');
}

test('MTS-007 defines one persistent pull-request CI workflow with read-only permissions', () => {
  const workflow = read(workflowPath);

  assert.match(workflow, /pull_request\s*:/);
  assert.match(workflow, /permissions\s*:\s*[\s\S]*contents\s*:\s*read/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version\s*:\s*['"]?24\.19\.0['"]?/);
  assert.match(workflow, /cache\s*:\s*['"]?pnpm['"]?/);
  assert.match(workflow, /pnpm-lock\.yaml/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
});

test('CI runs every technical-spec quality gate from a clean checkout', () => {
  const workflow = read(workflowPath);
  const requiredCommands = [
    'pnpm format',
    'pnpm lint',
    'pnpm typecheck',
    'pnpm test',
    'pnpm build',
    'pnpm audit --audit-level high',
    'pnpm ci:secrets',
    'pnpm ci:localization',
    'pnpm ci:privacy',
    'pnpm validate:infra',
    'pnpm ci:contracts',
    'pnpm ci:fixtures',
  ];

  for (const command of requiredCommands) {
    assert.ok(workflow.includes(command), `${command} must be a persistent CI gate`);
  }

  assert.match(workflow, /docker compose[\s\S]*(?:up|--wait)[\s\S]*(?:postgres|azurite)/);
});

test('normal CI cannot deploy, call live providers, or expose repository secrets', () => {
  const workflow = read(workflowPath);

  assert.doesNotMatch(workflow, /\bsecrets\./i);
  assert.doesNotMatch(workflow, /azure\/login/i);
  assert.doesNotMatch(workflow, /\baz\s+deployment\b/i);
  assert.doesNotMatch(workflow, /\bdeployment\s+(?:group|sub|mg|tenant)\s+create\b/i);
  assert.doesNotMatch(
    workflow,
    /\b(?:google|apple|meta|openai)[-_ ]?(?:oauth|api|provider)?[-_ ]?(?:key|secret|token)\b/i,
  );
  assert.doesNotMatch(workflow, /\bprintenv\b|\benv\s*\|/i);
  assert.doesNotMatch(workflow, /actions\/upload-artifact/i);
});

test('repository scripts expose deterministic CI-only validation commands', () => {
  const packageJson = JSON.parse(read(packageJsonPath));
  const gateScript = read(ciGateScriptPath);

  assert.match(packageJson.scripts.test, /tests\/mts-007\/\*\.test\.mjs/);
  assert.equal(packageJson.scripts['ci:secrets'], 'node scripts/ci-gates.mjs secrets');
  assert.equal(packageJson.scripts['ci:localization'], 'node scripts/ci-gates.mjs localization');
  assert.equal(packageJson.scripts['ci:privacy'], 'node scripts/ci-gates.mjs privacy');
  assert.equal(packageJson.scripts['ci:contracts'], 'node scripts/ci-gates.mjs contracts');
  assert.equal(packageJson.scripts['ci:fixtures'], 'node scripts/ci-gates.mjs self-test');

  for (const gate of ['secrets', 'localization', 'privacy', 'contracts', 'self-test']) {
    assert.match(gateScript, new RegExp(`\\b${gate}\\b`));
  }
});

test('deliberate failing fixtures are part of the normal CI rehearsal', () => {
  const gateScript = read(ciGateScriptPath);

  assert.match(gateScript, /self-test/);
  assert.match(gateScript, /secret/i);
  assert.match(gateScript, /localization/i);
  assert.match(gateScript, /privacy/i);
  assert.match(gateScript, /contract/i);
  assert.match(gateScript, /expected.*fail|must fail|reject/i);
});

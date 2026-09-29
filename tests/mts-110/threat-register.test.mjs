import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateReleaseReadiness,
  loadRegister,
  requiredCategories,
  requiredComponents,
  validateRegister,
} from '../../scripts/threat-model-check.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const registerPath = 'docs/security/threat-register.json';
const modelPath = 'docs/security/threat-model.md';

const baseThreat = {
  id: 'T-API-99',
  component: 'api',
  category: 'rate-limit-abuse',
  title: 'Synthetic threat',
  severity: 'medium',
  status: 'planned',
  mitigation: 'Synthetic mitigation.',
  tickets: ['MTS-111'],
  evidence: [],
  releaseBlocking: false,
};

const syntheticRegister = (threats) => ({ version: 1, ticket: 'MTS-110', threats });

test('MTS-110 threat register exists, parses, and passes structural validation', () => {
  assert.ok(existsSync(resolve(repoRoot, registerPath)), `${registerPath} must exist`);
  const register = loadRegister(repoRoot);
  assert.deepEqual(validateRegister(register, { repoRoot }), []);
});

test('MTS-110 covers every required system component', () => {
  assert.deepEqual(
    [...requiredComponents].sort(),
    ['api', 'blob', 'database', 'external-calendars', 'mobile', 'providers', 'queues', 'worker'],
  );
  const register = loadRegister(repoRoot);
  for (const component of requiredComponents) {
    assert.ok(
      register.threats.some((threat) => threat.component === component),
      `no threat recorded for component ${component}`,
    );
  }
});

test('MTS-110 covers rate limits, upload abuse, AI input risks, and account takeover', () => {
  assert.deepEqual(
    [...requiredCategories].sort(),
    ['account-takeover', 'ai-input', 'credential-exposure', 'rate-limit-abuse', 'upload-abuse'],
  );
  const register = loadRegister(repoRoot);
  for (const category of requiredCategories) {
    assert.ok(
      register.threats.some((threat) => threat.category === category),
      `no threat recorded for category ${category}`,
    );
  }
});

test('MTS-110 mitigations map to real tickets and, when mitigated, to existing test evidence', () => {
  const register = loadRegister(repoRoot);
  const tickets = readFileSync(resolve(repoRoot, 'docs/specifications/implementation-tickets.md'), 'utf8');
  for (const threat of register.threats) {
    assert.ok(threat.tickets.length > 0, `${threat.id} has no mapped ticket`);
    for (const ticket of threat.tickets) {
      assert.match(tickets, new RegExp(`^## ${ticket} `, 'm'), `${threat.id} references unknown ${ticket}`);
    }
    if (threat.status === 'mitigated') {
      assert.ok(threat.evidence.length > 0, `${threat.id} is mitigated without evidence`);
      for (const path of threat.evidence) {
        assert.ok(existsSync(resolve(repoRoot, path)), `${threat.id} evidence missing: ${path}`);
      }
      assert.ok(
        threat.evidence.some((path) => /\.test\.|^tests\//.test(path)),
        `${threat.id} is mitigated without a test in its evidence`,
      );
    }
  }
});

test('MTS-110 validation rejects malformed registers', () => {
  const rejected = (threats) => validateRegister(syntheticRegister(threats), { repoRoot }).length > 0;
  assert.equal(rejected([{ ...baseThreat, id: 'bad id' }]), true);
  assert.equal(rejected([{ ...baseThreat, tickets: ['MTS-999'] }]), true);
  assert.equal(rejected([{ ...baseThreat, tickets: [] }]), true);
  assert.equal(rejected([{ ...baseThreat, status: 'mitigated', evidence: [] }]), true);
  assert.equal(rejected([{ ...baseThreat, status: 'mitigated', evidence: ['no/such/file.test.ts'] }]), true);
  assert.equal(rejected([baseThreat, baseThreat]), true);
  assert.equal(rejected([{ ...baseThreat, severity: 'high', status: 'accepted', rationale: 'no' }]), true);
  assert.equal(rejected([{ ...baseThreat, severity: 'high', releaseBlocking: false }]), true);
  assert.equal(rejected([{ ...baseThreat, component: 'toaster' }]), true);
});

test('MTS-110 unresolved high-risk threats block release', () => {
  const highPlanned = { ...baseThreat, id: 'T-API-98', severity: 'high', releaseBlocking: true };
  const blocked = evaluateReleaseReadiness(syntheticRegister([baseThreat, highPlanned]));
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.blockers, ['T-API-98']);

  const resolved = evaluateReleaseReadiness(
    syntheticRegister([
      baseThreat,
      {
        ...highPlanned,
        status: 'mitigated',
        releaseBlocking: false,
        evidence: ['tests/mts-110/threat-register.test.mjs'],
      },
    ]),
  );
  assert.equal(resolved.ready, true);
  assert.deepEqual(resolved.blockers, []);
});

test('MTS-110 real register only ever blocks release on unresolved high-risk threats', () => {
  const register = loadRegister(repoRoot);
  const { blockers } = evaluateReleaseReadiness(register);
  const byId = new Map(register.threats.map((threat) => [threat.id, threat]));
  for (const id of blockers) {
    assert.equal(byId.get(id).severity, 'high');
    assert.notEqual(byId.get(id).status, 'mitigated');
  }
  for (const threat of register.threats) {
    if (threat.severity === 'high' && threat.status !== 'mitigated') {
      assert.ok(blockers.includes(threat.id), `${threat.id} must block release`);
    }
  }
});

test('MTS-110 threat model document lists every threat and the release gate', () => {
  assert.ok(existsSync(resolve(repoRoot, modelPath)), `${modelPath} must exist`);
  const document = readFileSync(resolve(repoRoot, modelPath), 'utf8');
  const register = loadRegister(repoRoot);
  for (const threat of register.threats) {
    assert.ok(document.includes(threat.id), `${modelPath} does not mention ${threat.id}`);
  }
  for (const heading of ['Trust boundaries', 'Assets', 'Release gate', 'Abuse controls']) {
    assert.match(document, new RegExp(`^## .*${heading}`, 'm'), `missing "${heading}" section`);
  }
  for (const component of requiredComponents) {
    assert.ok(document.includes(component), `${modelPath} does not discuss ${component}`);
  }
});

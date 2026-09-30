#!/usr/bin/env node
/**
 * MTS-110 threat-register checker.
 *
 * Validates docs/security/threat-register.json and evaluates the release gate:
 * an unresolved (not mitigated) high-severity threat blocks release.
 *
 * Usage:
 *   node scripts/threat-model-check.mjs            validate structure; report release blockers
 *   node scripts/threat-model-check.mjs --release  additionally exit 1 while any blocker remains
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const writeLine = (text) => process.stdout.write(`${text}\n`);
const writeError = (text) => process.stderr.write(`${text}\n`);

export const requiredComponents = Object.freeze([
  'mobile',
  'api',
  'worker',
  'database',
  'blob',
  'queues',
  'providers',
  'external-calendars',
]);

export const requiredCategories = Object.freeze([
  'rate-limit-abuse',
  'upload-abuse',
  'ai-input',
  'account-takeover',
  'credential-exposure',
]);

const allowedCategories = new Set([
  ...requiredCategories,
  'replay',
  'injection',
  'privacy-disclosure',
  'privilege-escalation',
  'denial-of-service',
  'hardening',
]);
const severities = new Set(['high', 'medium', 'low']);
const statuses = new Set(['mitigated', 'planned', 'accepted']);
const idPattern = /^T-[A-Z]{2,5}-\d{2}$/;
const ticketPattern = /^MTS-\d{3}$/;
const testEvidencePattern = /\.test\.|^tests\//;

export const registerRelativePath = 'docs/security/threat-register.json';

export function loadRegister(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, registerRelativePath), 'utf8'));
}

function knownTickets(repoRoot) {
  const document = readFileSync(
    join(repoRoot, 'docs/specifications/implementation-tickets.md'),
    'utf8',
  );
  return new Set([...document.matchAll(/^## (MTS-\d{3}) /gm)].map((match) => match[1]));
}

/** Returns a list of human-readable problems; an empty list means the register is valid. */
export function validateRegister(register, { repoRoot }) {
  const errors = [];
  if (register === null || typeof register !== 'object') return ['register must be an object'];
  if (register.version !== 1) errors.push('register.version must be 1');
  if (register.ticket !== 'MTS-110') errors.push('register.ticket must be MTS-110');
  if (!Array.isArray(register.threats) || register.threats.length === 0) {
    return [...errors, 'register.threats must be a non-empty array'];
  }

  const tickets = knownTickets(repoRoot);
  const ids = new Set();
  for (const threat of register.threats) {
    const label = typeof threat?.id === 'string' ? threat.id : '<unnamed threat>';
    const fail = (message) => errors.push(`${label}: ${message}`);

    if (typeof threat?.id !== 'string' || !idPattern.test(threat.id))
      fail('id must match T-XXX-NN');
    else if (ids.has(threat.id)) fail('duplicate id');
    else ids.add(threat.id);

    if (!requiredComponents.includes(threat.component))
      fail(`unknown component "${threat.component}"`);
    if (!allowedCategories.has(threat.category)) fail(`unknown category "${threat.category}"`);
    if (!severities.has(threat.severity)) fail(`unknown severity "${threat.severity}"`);
    if (!statuses.has(threat.status)) fail(`unknown status "${threat.status}"`);
    for (const field of ['title', 'mitigation']) {
      if (typeof threat[field] !== 'string' || threat[field].trim() === '')
        fail(`${field} must be non-empty text`);
    }

    if (!Array.isArray(threat.tickets) || threat.tickets.length === 0) {
      fail('must map to at least one ticket');
    } else {
      for (const ticket of threat.tickets) {
        if (!ticketPattern.test(ticket) || !tickets.has(ticket))
          fail(`maps to unknown ticket "${ticket}"`);
      }
    }

    const evidence = Array.isArray(threat.evidence) ? threat.evidence : [];
    if (!Array.isArray(threat.evidence)) fail('evidence must be an array');
    for (const path of evidence) {
      if (typeof path !== 'string' || isAbsolute(path) || path.split('/').includes('..')) {
        fail(`evidence path must be repository-relative: ${path}`);
      } else if (!existsSync(join(repoRoot, path))) {
        fail(`evidence file does not exist: ${path}`);
      }
    }

    if (threat.status === 'mitigated' && !evidence.some((path) => testEvidencePattern.test(path))) {
      fail('mitigated threats need at least one test in evidence');
    }
    if (threat.status === 'accepted') {
      if (threat.severity === 'high') fail('high-severity threats cannot be accepted');
      if (typeof threat.rationale !== 'string' || threat.rationale.trim().length < 20) {
        fail('accepted threats need a written rationale');
      }
    }

    const shouldBlock = threat.severity === 'high' && threat.status !== 'mitigated';
    if (threat.releaseBlocking !== shouldBlock) {
      fail(
        `releaseBlocking must be ${shouldBlock} for a ${threat.severity} ${threat.status} threat`,
      );
    }
  }
  return errors;
}

/** High-risk threats that are not yet mitigated block release. */
export function evaluateReleaseReadiness(register) {
  const blockers = register.threats
    .filter((threat) => threat.severity === 'high' && threat.status !== 'mitigated')
    .map((threat) => threat.id);
  return { ready: blockers.length === 0, blockers };
}

function main(argv) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const register = loadRegister(repoRoot);
  const errors = validateRegister(register, { repoRoot });
  for (const error of errors) writeError(`threat-register: ${error}`);
  if (errors.length > 0) return 1;

  const { ready, blockers } = evaluateReleaseReadiness(register);
  const counts = { mitigated: 0, planned: 0, accepted: 0 };
  for (const threat of register.threats) counts[threat.status] += 1;
  writeLine(
    `Threat register valid: ${register.threats.length} threats ` +
      `(${counts.mitigated} mitigated, ${counts.planned} planned, ${counts.accepted} accepted).`,
  );
  if (ready) {
    writeLine('Release gate: no unresolved high-risk threats.');
    return 0;
  }
  writeLine(
    `Release gate: ${blockers.length} unresolved high-risk threat(s): ${blockers.join(', ')}.`,
  );
  return argv.includes('--release') ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

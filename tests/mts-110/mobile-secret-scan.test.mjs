import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkMobileEnvUsage,
  scanBuffer,
  scanDirectory,
  scanText,
  serverOnlyEnvNames,
} from '../../scripts/mobile-secret-scan.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Synthetic values assembled at runtime so this file never contains a scannable secret literal.
const fake = {
  privateKey: ['-----BEGIN', 'PRIVATE KEY-----', 'MIIEvQIBADANBgkq'].join(' '),
  storageKey: ['DefaultEndpointsProtocol=https;AccountName=misyra;', 'AccountKey=', 'A'.repeat(64), '=='].join(''),
  googleSecret: ['GOCSPX', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4'].join('-'),
  databaseUrl: ['postgresql://misyra:', 'hunter2hunter2', '@db.internal:5432/misyra'].join(''),
  bearer: ['Authorization: Bearer ', 'eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'c2lnbmF0dXJlLXZhbHVl'].join(''),
  assignment: ['clientSecret', ' = "', 'opaque-value-12345', '"'].join(''),
};

test('MTS-110 mobile scan flags every seeded secret class without echoing the secret', () => {
  const cases = [
    ['private-key', fake.privateKey, 'MIIEvQIBADANBgkq'],
    ['azure-storage-key', fake.storageKey, 'A'.repeat(64)],
    ['google-client-secret', fake.googleSecret, 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4'],
    ['database-url-credentials', fake.databaseUrl, 'hunter2hunter2'],
    ['bearer-token', fake.bearer, 'c2lnbmF0dXJlLXZhbHVl'],
    ['secret-assignment', fake.assignment, 'opaque-value-12345'],
  ];
  for (const [rule, text, secret] of cases) {
    const findings = scanText('bundle.js', `var x=1;${text};var y=2;`);
    assert.ok(
      findings.some((finding) => finding.rule === rule),
      `expected rule ${rule} to fire`,
    );
    assert.ok(!JSON.stringify(findings).includes(secret), `finding for ${rule} leaked the secret value`);
    for (const finding of findings) {
      assert.deepEqual(Object.keys(finding).sort(), ['file', 'line', 'rule']);
    }
  }
});

test('MTS-110 mobile scan flags server-only environment variable names in a bundle', () => {
  assert.ok(serverOnlyEnvNames.includes('DATABASE_URL'));
  for (const name of serverOnlyEnvNames) {
    const findings = scanText('bundle.js', `const v=process.env.${name};`);
    assert.ok(
      findings.some((finding) => finding.rule === 'server-only-env-name'),
      `${name} must be rejected in mobile output`,
    );
  }
});

test('MTS-110 mobile scan accepts a clean bundle with public configuration', () => {
  const clean = [
    'const privacy="https://example.org/privacy";',
    'const id="123e4567-e89b-12d3-a456-426614174000";',
    'const v=process.env.EXPO_PUBLIC_APP_VERSION;',
    'const label="Sign in with Apple";',
  ].join('\n');
  assert.deepEqual(scanText('bundle.js', clean), []);
});

test('MTS-110 mobile scan finds secrets embedded in binary artifacts and never reports contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'misyra-mobile-scan-'));
  mkdirSync(join(directory, 'assets'), { recursive: true });
  const binary = Buffer.concat([
    Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0x00, 0x01, 0x02, 0x00]),
    Buffer.from(fake.googleSecret, 'utf8'),
    Buffer.from([0x00, 0xff, 0xfe]),
  ]);
  writeFileSync(join(directory, 'assets', 'index.android.hbc'), binary);
  writeFileSync(join(directory, 'clean.js'), 'console.log("ok");');

  const findings = scanDirectory(directory);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'google-client-secret');
  assert.match(findings[0].file, /index\.android\.hbc$/);
  assert.ok(!JSON.stringify(findings).includes('a1B2c3D4e5F6g7H8i9J0k1L2m3N4'));
  assert.deepEqual(scanBuffer('x.bin', Buffer.from('nothing to see')), []);
});

test('MTS-110 mobile source reads only public or allow-listed environment variables', () => {
  assert.deepEqual(checkMobileEnvUsage(join(repoRoot, 'apps/mobile')), []);
});

test('MTS-110 mobile environment check rejects server-only variables in mobile source', () => {
  const directory = mkdtempSync(join(tmpdir(), 'misyra-mobile-src-'));
  mkdirSync(join(directory, 'src'), { recursive: true });
  writeFileSync(join(directory, 'src', 'leak.ts'), 'export const url = process.env.DATABASE_URL;\n');
  writeFileSync(join(directory, 'app.config.ts'), 'export default { extra: { key: process.env.TOKEN_ENCRYPTION_KEY } };\n');
  const violations = checkMobileEnvUsage(directory);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((violation) => violation.name === 'DATABASE_URL'));
  assert.ok(violations.some((violation) => violation.name === 'TOKEN_ENCRYPTION_KEY'));
});

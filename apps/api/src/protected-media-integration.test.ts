import { createHmac, randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiApplication } from './application.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts078_${randomUUID().replaceAll('-', '')}`;
const databaseUrl =
  `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl =
  `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;
const azuritePort = process.env.AZURITE_BLOB_PORT ?? '10000';
const azuriteAccount = 'devstoreaccount1';
const azuriteKey =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const azuriteEndpoint = `http://127.0.0.1:${azuritePort}/${azuriteAccount}`;
const apiNow = new Date('2026-09-18T10:00:00.000Z');

let pool: Pool;
let accountA: string;
let accountB: string;

function canonicalizedHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .filter(([name]) => name.toLowerCase().startsWith('x-ms-'))
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');
}

function canonicalizedResource(url: URL) {
  const parameters = new Map<string, string[]>();
  for (const [rawName, value] of url.searchParams.entries()) {
    const name = rawName.toLowerCase();
    const values = parameters.get(name) ?? [];
    values.push(value);
    parameters.set(name, values);
  }

  let resource = `/${azuriteAccount}${url.pathname}`;
  for (const name of [...parameters.keys()].sort()) {
    const values = parameters.get(name) ?? [];
    resource += `\n${name}:${values.sort().join(',')}`;
  }
  return resource;
}

function signedAzuriteHeaders(
  method: string,
  url: URL,
  body: Buffer | undefined,
  additionalHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    'x-ms-date': apiNow.toUTCString(),
    'x-ms-version': '2023-11-03',
    ...additionalHeaders,
  };
  const contentLength = body && body.length > 0 ? String(body.length) : '';
  if (body && body.length > 0) headers['content-length'] = contentLength;

  const standardFields = [
    method.toUpperCase(),
    '',
    '',
    contentLength,
    '',
    headers['content-type'] ?? '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  const stringToSign =
    `${standardFields.join('\n')}\n${canonicalizedHeaders(headers)}${canonicalizedResource(url)}`;
  const signature = createHmac('sha256', Buffer.from(azuriteKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  headers.authorization = `SharedKey ${azuriteAccount}:${signature}`;
  return headers;
}

async function ensurePrivateContainer(container: string) {
  const url = new URL(`${azuriteEndpoint}/${container}?restype=container`);
  const response = await fetch(url, {
    method: 'PUT',
    headers: signedAzuriteHeaders('PUT', url, undefined),
  });
  expect([201, 409]).toContain(response.status);
}

async function readPrivateBlob(container: string, storageKey: string) {
  const encodedKey = storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = new URL(`${azuriteEndpoint}/${container}/${encodedKey}`);
  const response = await fetch(url, {
    headers: signedAzuriteHeaders('GET', url, undefined),
  });
  return { response, bytes: Buffer.from(await response.arrayBuffer()), url };
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountA = randomUUID();
  accountB = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject)
     VALUES ($1, 'google', $2), ($3, 'google', $4)`,
    [accountA, `mts078-a-${accountA}`, accountB, `mts078-b-${accountB}`],
  );
  await ensurePrivateContainer('evidence-working');
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

function createServer(activeAccount: { value: string }, auditLog = vi.fn()) {
  return {
    auditLog,
    server: createApiApplication({
      pool,
      expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
      issueAccessToken: () => 'fixture-access-token',
      reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
      now: () => apiNow,
      authenticate: () => ({ accountId: activeAccount.value }),
      auditLog,
    }),
  };
}

async function authorizeOriginalUpload(
  server: ReturnType<typeof createApiApplication>,
  assetId: string,
) {
  const response = await server.inject({
    method: 'POST',
    url: `/v1/media/assets/${assetId}/upload-authorizations`,
    payload: {
      purpose: 'evidence-working',
      variant: 'original',
      contentType: 'image/jpeg',
    },
  });
  expect(response.statusCode).toBe(200);
  const payload = response.json().payload as {
    assetId: string;
    purpose: string;
    variant: string;
    uploadPath: string;
    expiresAt: string;
  };
  expect(payload).toMatchObject({
    assetId,
    purpose: 'evidence-working',
    variant: 'original',
  });
  expect(payload.uploadPath).toMatch(/^\/v1\/media\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(apiNow.getTime());
  expect(JSON.stringify(payload)).not.toContain('blob.core.windows.net');
  expect(payload).not.toHaveProperty('storageKey');
  return payload;
}

describe('MTS-078 protected media upload service', () => {
  it(
    'binds a short-lived upload authorization to account, purpose, asset, and variant',
    async () => {
    const activeAccount = { value: accountA };
    const assetId = randomUUID();
    const { server } = createServer(activeAccount);

    await authorizeOriginalUpload(server, assetId);

    const result = await pool.query<{
      accountId: string;
      purpose: string;
      originalStorageKey: string | null;
      thumbnailStorageKey: string | null;
      derivativeStorageKey: string | null;
      temporaryStorageKey: string | null;
      deletionDueAt: Date | null;
      deletionState: string;
      retryState: string;
    }>(
      `SELECT
         account_id AS "accountId",
         purpose,
         original_storage_key AS "originalStorageKey",
         thumbnail_storage_key AS "thumbnailStorageKey",
         derivative_storage_key AS "derivativeStorageKey",
         temporary_storage_key AS "temporaryStorageKey",
         deletion_due_at AS "deletionDueAt",
         deletion_state AS "deletionState",
         retry_state AS "retryState"
       FROM media_assets
       WHERE id = $1`,
      [assetId],
    );

    expect(result.rows[0]).toMatchObject({
      accountId: accountA,
      purpose: 'evidence-working',
      originalStorageKey: `${accountA}/${assetId}/original`,
      thumbnailStorageKey: null,
      derivativeStorageKey: null,
      temporaryStorageKey: null,
      deletionState: 'active',
      retryState: 'ready',
    });
    expect(result.rows[0]?.deletionDueAt?.toISOString()).toBe('2026-10-18T10:00:00.000Z');
      await server.close();
    },
  );

  it(
    'rejects cross-account authorization and token replay without disclosing another account asset',
    async () => {
      const activeAccount = { value: accountA };
      const assetId = randomUUID();
      const { server } = createServer(activeAccount);
      const authorization = await authorizeOriginalUpload(server, assetId);

      activeAccount.value = accountB;
      const crossAccountAuthorization = await server.inject({
        method: 'POST',
        url: `/v1/media/assets/${assetId}/upload-authorizations`,
        payload: {
          purpose: 'evidence-working',
          variant: 'original',
          contentType: 'image/jpeg',
        },
      });
      const crossAccountUpload = await server.inject({
        method: 'PUT',
        url: authorization.uploadPath,
        headers: { 'content-type': 'application/octet-stream' },
        payload: Buffer.from('private-media'),
      });

      expect(crossAccountAuthorization.statusCode).toBe(404);
      expect(crossAccountAuthorization.json()).toMatchObject({ error: { code: 'not_found' } });
      expect(crossAccountUpload.statusCode).toBe(404);
      expect(crossAccountUpload.json()).toMatchObject({ error: { code: 'not_found' } });
      await server.close();
    },
  );

  it('uploads through the scoped API path into a private Azurite container', async () => {
    const activeAccount = { value: accountA };
    const assetId = randomUUID();
    const { server } = createServer(activeAccount);
    const authorization = await authorizeOriginalUpload(server, assetId);
    const bytes = Buffer.from('fixture-image-binary');

    const upload = await server.inject({
      method: 'PUT',
      url: authorization.uploadPath,
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes,
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({
      ok: true,
      payload: { assetId, variant: 'original', uploaded: true },
    });

    const registry = await pool.query<{ storageKey: string }>(
      `SELECT original_storage_key AS "storageKey"
         FROM media_assets
        WHERE id = $1 AND account_id = $2`,
      [assetId, accountA],
    );
    const storageKey = registry.rows[0]?.storageKey;
    expect(storageKey).toBeTruthy();

    const stored = await readPrivateBlob('evidence-working', storageKey ?? '');
    expect(stored.response.status).toBe(200);
    expect(stored.bytes).toEqual(bytes);

    const anonymous = await fetch(stored.url);
    expect(anonymous.status).not.toBe(200);
    await server.close();
  });

  it('emits only correlation metadata for media authorization and upload requests', async () => {
    const activeAccount = { value: accountA };
    const assetId = randomUUID();
    const { server, auditLog } = createServer(activeAccount);
    const authorization = await authorizeOriginalUpload(server, assetId);

    await server.inject({
      method: 'PUT',
      url: authorization.uploadPath,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('secret-image-body'),
    });

    expect(auditLog.mock.calls).toEqual([
      [
        expect.objectContaining({
          method: 'POST',
          route: '/media/assets/:assetId/upload-authorizations',
          statusCode: 200,
        }),
      ],
      [
        expect.objectContaining({
          method: 'PUT',
          route: '/media/uploads/:token',
          statusCode: 200,
        }),
      ],
    ]);
    const serialized = JSON.stringify(auditLog.mock.calls);
    expect(serialized).not.toContain('secret-image-body');
    expect(serialized).not.toContain('image/jpeg');
    expect(serialized).not.toContain('evidence-working');
    expect(serialized).not.toContain(assetId);
    await server.close();
  });
});

import { createHmac, timingSafeEqual } from 'node:crypto';

import { calculateMediaDeletionDeadline, classifyMediaPurpose } from '@misyra/domain';
import type { Pool } from 'pg';

export type MediaUploadPurpose =
  'evidence-working' | 'story-working' | 'planner-working' | 'style-references';

export type MediaUploadVariant = 'original' | 'thumbnail' | 'derivative' | 'temporary';

export type ProtectedMediaBlobStore = Readonly<{
  put(
    container: MediaUploadPurpose,
    storageKey: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void>;
}>;

type ProtectedMediaServiceOptions = Readonly<{
  pool: Pool;
  signingSecret: string;
  blobStore: ProtectedMediaBlobStore;
  now?: () => Date;
}>;

type UploadClaims = Readonly<{
  v: 1;
  accountId: string;
  assetId: string;
  purpose: MediaUploadPurpose;
  variant: MediaUploadVariant;
  contentType: string;
  exp: number;
}>;

export class ProtectedMediaError extends Error {
  constructor(readonly code: 'validation_failed' | 'not_found' | 'conflict') {
    super(code);
    this.name = 'ProtectedMediaError';
  }
}

const UPLOAD_AUTHORIZATION_TTL_MS = 5 * 60 * 1_000;
const PRODUCT_MEDIA_PURPOSES = new Set<MediaUploadPurpose>([
  'evidence-working',
  'story-working',
  'planner-working',
  'style-references',
]);
const MEDIA_VARIANTS = new Set<MediaUploadVariant>([
  'original',
  'thumbnail',
  'derivative',
  'temporary',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AZURITE_ACCOUNT = 'devstoreaccount1';
const AZURITE_DEVELOPMENT_CREDENTIAL = [
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/',
  'K1SZFPTOtr/KBHBeksoGMGw==',
].join('');
const AZURE_STORAGE_VERSION = '2023-11-03';

function isPurpose(value: unknown): value is MediaUploadPurpose {
  return typeof value === 'string' && PRODUCT_MEDIA_PURPOSES.has(value as MediaUploadPurpose);
}

function isVariant(value: unknown): value is MediaUploadVariant {
  return typeof value === 'string' && MEDIA_VARIANTS.has(value as MediaUploadVariant);
}

function isImageContentType(value: unknown): value is string {
  return typeof value === 'string' && /^image\/[a-z0-9.+-]{1,64}$/i.test(value);
}

function storageColumn(variant: MediaUploadVariant) {
  switch (variant) {
    case 'original':
      return 'original_storage_key';
    case 'thumbnail':
      return 'thumbnail_storage_key';
    case 'derivative':
      return 'derivative_storage_key';
    case 'temporary':
      return 'temporary_storage_key';
  }
}

function storageKey(accountId: string, assetId: string, variant: MediaUploadVariant) {
  return `${accountId}/${assetId}/${variant}`;
}

function signToken(secret: string, claims: UploadClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(secret: string, token: string, now: Date): UploadClaims | null {
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) return null;

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<UploadClaims>;
    if (
      claims.v !== 1 ||
      typeof claims.accountId !== 'string' ||
      !UUID_PATTERN.test(claims.accountId) ||
      typeof claims.assetId !== 'string' ||
      !UUID_PATTERN.test(claims.assetId) ||
      !isPurpose(claims.purpose) ||
      !isVariant(claims.variant) ||
      !isImageContentType(claims.contentType) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= now.getTime()
    ) {
      return null;
    }
    return claims as UploadClaims;
  } catch {
    return null;
  }
}

function encodeBlobKey(key: string) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function canonicalizedAzuriteHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .filter(([name]) => name.toLowerCase().startsWith('x-ms-'))
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');
}

function canonicalizedAzuriteResource(url: URL) {
  const parameters = new Map<string, string[]>();
  for (const [rawName, value] of url.searchParams.entries()) {
    const name = rawName.toLowerCase();
    const values = parameters.get(name) ?? [];
    values.push(value);
    parameters.set(name, values);
  }

  let resource = `/${AZURITE_ACCOUNT}${url.pathname}`;
  for (const name of [...parameters.keys()].sort()) {
    resource += `\n${name}:${(parameters.get(name) ?? []).sort().join(',')}`;
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
    'x-ms-date': new Date().toUTCString(),
    'x-ms-version': AZURE_STORAGE_VERSION,
    ...additionalHeaders,
  };
  const contentLength = body && body.length > 0 ? String(body.length) : '';
  if (body && body.length > 0) headers['content-length'] = contentLength;

  const stringToSign = `${[
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
  ].join('\n')}\n${canonicalizedAzuriteHeaders(headers)}${canonicalizedAzuriteResource(url)}`;
  const signature = createHmac('sha256', Buffer.from(AZURITE_DEVELOPMENT_CREDENTIAL, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  headers.authorization = `SharedKey ${AZURITE_ACCOUNT}:${signature}`;
  return headers;
}

function createAzuriteBlobStore(env: NodeJS.ProcessEnv): ProtectedMediaBlobStore {
  const port = env.AZURITE_BLOB_PORT ?? '10000';
  const endpoint = `http://127.0.0.1:${port}/${AZURITE_ACCOUNT}`;

  async function ensureContainer(container: MediaUploadPurpose) {
    const url = new URL(`${endpoint}/${container}?restype=container`);
    const response = await fetch(url, {
      method: 'PUT',
      headers: signedAzuriteHeaders('PUT', url, undefined),
    });
    if (response.status !== 201 && response.status !== 409) {
      throw new Error('Protected media container is unavailable');
    }
  }

  return {
    async put(container, key, bytes, contentType) {
      await ensureContainer(container);
      const url = new URL(`${endpoint}/${container}/${encodeBlobKey(key)}`);
      const response = await fetch(url, {
        method: 'PUT',
        headers: signedAzuriteHeaders('PUT', url, bytes, {
          'content-type': contentType,
          'x-ms-blob-type': 'BlockBlob',
        }),
        body: new Uint8Array(bytes),
      });
      if (!response.ok) throw new Error('Protected media upload failed');
    },
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function managedIdentityAccessToken(env: NodeJS.ProcessEnv) {
  const endpoint = requiredEnv(env, 'IDENTITY_ENDPOINT');
  const identityHeader = requiredEnv(env, 'IDENTITY_HEADER');
  const url = new URL(endpoint);
  url.searchParams.set('resource', 'https://storage.azure.com/');
  url.searchParams.set('api-version', '2019-08-01');

  const response = await fetch(url, {
    headers: {
      'X-IDENTITY-HEADER': identityHeader,
      Metadata: 'true',
    },
  });
  if (!response.ok) throw new Error('Managed identity token request failed');
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Managed identity token response is invalid');
  }
  return payload.access_token;
}

function createAzureManagedIdentityBlobStore(env: NodeJS.ProcessEnv): ProtectedMediaBlobStore {
  const accountName = requiredEnv(env, 'AZURE_STORAGE_ACCOUNT_NAME');
  if (!/^[a-z0-9]{3,24}$/.test(accountName)) {
    throw new Error('AZURE_STORAGE_ACCOUNT_NAME is invalid');
  }

  return {
    async put(container, key, bytes, contentType) {
      const token = await managedIdentityAccessToken(env);
      const url = new URL(
        `https://${accountName}.blob.core.windows.net/${container}/${encodeBlobKey(key)}`,
      );
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-version': AZURE_STORAGE_VERSION,
        },
        body: new Uint8Array(bytes),
      });
      if (!response.ok) throw new Error('Protected media upload failed');
    },
  };
}

export function createProtectedMediaBlobStore(
  env: NodeJS.ProcessEnv = process.env,
): ProtectedMediaBlobStore {
  return env.NODE_ENV === 'production'
    ? createAzureManagedIdentityBlobStore(env)
    : createAzuriteBlobStore(env);
}

export function createProtectedMediaService(options: ProtectedMediaServiceOptions) {
  if (options.signingSecret.length < 32) {
    throw new Error('Protected media signing secret must be at least 32 characters');
  }
  const now = options.now ?? (() => new Date());

  return {
    async authorizeUpload(
      accountId: string,
      assetId: string,
      input: Readonly<{ purpose: unknown; variant: unknown; contentType: unknown }>,
    ) {
      if (
        !UUID_PATTERN.test(assetId) ||
        !isPurpose(input.purpose) ||
        !isVariant(input.variant) ||
        !isImageContentType(input.contentType)
      ) {
        throw new ProtectedMediaError('validation_failed');
      }
      classifyMediaPurpose(input.purpose);
      const currentTime = now();
      const deletionDueAt = calculateMediaDeletionDeadline(
        currentTime.toISOString(),
        input.purpose,
      );
      const key = storageKey(accountId, assetId, input.variant);
      const column = storageColumn(input.variant);
      const client = await options.pool.connect();

      try {
        await client.query('BEGIN');
        const existing = await client.query<{ accountId: string; purpose: string }>(
          `SELECT account_id AS "accountId", purpose
             FROM media_assets
            WHERE id = $1
            FOR UPDATE`,
          [assetId],
        );
        const current = existing.rows[0];
        if (current !== undefined) {
          if (current.accountId !== accountId) throw new ProtectedMediaError('not_found');
          if (current.purpose !== input.purpose) throw new ProtectedMediaError('conflict');
          await client.query(
            `UPDATE media_assets
                SET ${column} = $3
              WHERE id = $1 AND account_id = $2`,
            [assetId, accountId, key],
          );
        } else {
          await client.query(
            `INSERT INTO media_assets
               (id, account_id, purpose, storage_key, ${column}, deletion_due_at,
                deletion_state, retry_state, created_at)
             VALUES ($1, $2, $3, $4, $4, $5, 'active', 'ready', $6)`,
            [
              assetId,
              accountId,
              input.purpose,
              key,
              deletionDueAt === null ? null : new Date(deletionDueAt),
              currentTime,
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const expiresAt = new Date(currentTime.getTime() + UPLOAD_AUTHORIZATION_TTL_MS);
      const token = signToken(options.signingSecret, {
        v: 1,
        accountId,
        assetId,
        purpose: input.purpose,
        variant: input.variant,
        contentType: input.contentType,
        exp: expiresAt.getTime(),
      });

      return {
        assetId,
        purpose: input.purpose,
        variant: input.variant,
        uploadPath: `/v1/media/uploads/${token}`,
        expiresAt: expiresAt.toISOString(),
      };
    },

    async upload(accountId: string, token: string, body: unknown) {
      const claims = verifyToken(options.signingSecret, token, now());
      if (claims === null || claims.accountId !== accountId || !Buffer.isBuffer(body)) {
        throw new ProtectedMediaError('not_found');
      }

      const key = storageKey(claims.accountId, claims.assetId, claims.variant);
      const column = storageColumn(claims.variant);
      const result = await options.pool.query<{ storageKey: string | null }>(
        `SELECT ${column} AS "storageKey"
           FROM media_assets
          WHERE id = $1
            AND account_id = $2
            AND purpose = $3
            AND deletion_state = 'active'`,
        [claims.assetId, accountId, claims.purpose],
      );
      if (result.rows[0]?.storageKey !== key) throw new ProtectedMediaError('not_found');

      await options.blobStore.put(claims.purpose, key, body, claims.contentType);
      return {
        assetId: claims.assetId,
        variant: claims.variant,
        uploaded: true as const,
      };
    },
  };
}

export type ProtectedMediaService = ReturnType<typeof createProtectedMediaService>;

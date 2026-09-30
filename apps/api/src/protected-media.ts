import { createHmac, timingSafeEqual } from 'node:crypto';

import { calculateMediaDeletionDeadline, classifyMediaPurpose } from '@misyra/domain';
import type { Pool } from 'pg';

export type MediaUploadPurpose =
  'evidence-working' | 'story-working' | 'planner-working' | 'style-references';

export type PrivateBlobContainer = MediaUploadPurpose | 'feedback-retained';

export type MediaUploadVariant = 'original' | 'thumbnail' | 'derivative' | 'temporary';

export type ProtectedMediaBlobStore = Readonly<{
  put(
    container: PrivateBlobContainer,
    storageKey: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void>;
  get(container: PrivateBlobContainer, storageKey: string): Promise<Buffer>;
  delete(container: PrivateBlobContainer, storageKey: string): Promise<void>;
}>;

export type ProtectedMediaUploadCommitted = Readonly<{
  accountId: string;
  assetId: string;
  purpose: MediaUploadPurpose;
  variant: MediaUploadVariant;
}>;

type ProtectedMediaServiceOptions = Readonly<{
  pool: Pool;
  signingSecret: string;
  verificationSigningSecrets?: readonly string[];
  blobStore: ProtectedMediaBlobStore;
  now?: () => Date;
  onUploadCommitted?: (input: ProtectedMediaUploadCommitted) => Promise<void>;
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

const SUPPORTED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_IMAGE_PIXELS = 64_000_000;

function isImageContentType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SUPPORTED_IMAGE_CONTENT_TYPES.has(value.toLowerCase())
  );
}

type ImageDimensions = Readonly<{ width: number; height: number }>;

function validDimensions(dimensions: ImageDimensions | null): boolean {
  if (dimensions === null) return false;
  const { width, height } = dimensions;
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

function pngDimensions(bytes: Buffer): ImageDimensions | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function gifDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const signature = bytes.toString('ascii', 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function jpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function isoBaseMediaDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 32 || bytes.toString('ascii', 4, 8) !== 'ftyp') return null;
  const brands = bytes.toString('ascii', 8, Math.min(bytes.length, 64));
  if (!/(heic|heix|hevc|hevx|heif|mif1|msf1|avif|avis)/.test(brands)) return null;
  const ispe = bytes.indexOf(Buffer.from('ispe'));
  if (ispe < 4 || ispe + 16 > bytes.length) return null;
  return {
    width: bytes.readUInt32BE(ispe + 8),
    height: bytes.readUInt32BE(ispe + 12),
  };
}

function imageDimensions(bytes: Buffer, contentType: string): ImageDimensions | null {
  switch (contentType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return jpegDimensions(bytes);
    case 'image/png':
      return pngDimensions(bytes);
    case 'image/gif':
      return gifDimensions(bytes);
    case 'image/webp':
      return webpDimensions(bytes);
    case 'image/heic':
    case 'image/heif':
    case 'image/avif':
      return isoBaseMediaDimensions(bytes);
    default:
      return null;
  }
}

function isValidImagePayload(bytes: Buffer, contentType: string): boolean {
  return validDimensions(imageDimensions(bytes, contentType));
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

function verifyToken(
  secrets: readonly string[],
  token: string,
  now: Date,
): UploadClaims | null {
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) return null;

  const supplied = Buffer.from(suppliedSignature);
  const signatureMatches = secrets.some((secret) => {
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
    const expected = Buffer.from(expectedSignature);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
  if (!signatureMatches) return null;

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

function isImmutableEvidenceOriginal(container: PrivateBlobContainer, key: string) {
  return container === 'evidence-working' && key.endsWith('/original');
}

function isImmutableOriginalAlreadyStored(response: Response, immutableOriginal: boolean) {
  if (!immutableOriginal) return false;
  if (response.status === 412) return true;
  return response.status === 409 && response.headers.get('x-ms-error-code') === 'BlobAlreadyExists';
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
    headers['if-none-match'] ?? '',
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

  async function ensureContainer(container: PrivateBlobContainer) {
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
      const immutableOriginal = isImmutableEvidenceOriginal(container, key);
      const response = await fetch(url, {
        method: 'PUT',
        headers: signedAzuriteHeaders('PUT', url, bytes, {
          'content-type': contentType,
          'x-ms-blob-type': 'BlockBlob',
          ...(immutableOriginal ? { 'if-none-match': '*' } : {}),
        }),
        body: new Uint8Array(bytes),
      });
      if (!response.ok && !isImmutableOriginalAlreadyStored(response, immutableOriginal)) {
        throw new Error('Protected media upload failed');
      }
    },
    async get(container, key) {
      const url = new URL(`${endpoint}/${container}/${encodeBlobKey(key)}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: signedAzuriteHeaders('GET', url, undefined),
      });
      if (!response.ok) throw new Error('Protected media read failed');
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(container, key) {
      const url = new URL(`${endpoint}/${container}/${encodeBlobKey(key)}`);
      const response = await fetch(url, {
        method: 'DELETE',
        headers: signedAzuriteHeaders('DELETE', url, undefined),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error('Protected media deletion failed');
      }
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
      const immutableOriginal = isImmutableEvidenceOriginal(container, key);
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-version': AZURE_STORAGE_VERSION,
          ...(immutableOriginal ? { 'If-None-Match': '*' } : {}),
        },
        body: new Uint8Array(bytes),
      });
      if (!response.ok && !isImmutableOriginalAlreadyStored(response, immutableOriginal)) {
        throw new Error('Protected media upload failed');
      }
    },
    async get(container, key) {
      const token = await managedIdentityAccessToken(env);
      const url = new URL(
        `https://${accountName}.blob.core.windows.net/${container}/${encodeBlobKey(key)}`,
      );
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-ms-version': AZURE_STORAGE_VERSION,
        },
      });
      if (!response.ok) throw new Error('Protected media read failed');
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(container, key) {
      const token = await managedIdentityAccessToken(env);
      const url = new URL(
        `https://${accountName}.blob.core.windows.net/${container}/${encodeBlobKey(key)}`,
      );
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-ms-version': AZURE_STORAGE_VERSION,
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error('Protected media deletion failed');
      }
    },
  };
}

export function createProtectedMediaBlobStore(
  env: NodeJS.ProcessEnv = process.env,
): ProtectedMediaBlobStore {
  if (env.AZURE_STORAGE_ACCOUNT_NAME || env.NODE_ENV === 'production') {
    return createAzureManagedIdentityBlobStore(env);
  }
  return createAzuriteBlobStore(env);
}

export function createProtectedMediaService(options: ProtectedMediaServiceOptions) {
  const verificationSigningSecrets = options.verificationSigningSecrets ?? [];
  if (
    options.signingSecret.length < 32 ||
    verificationSigningSecrets.some((secret) => secret.length < 32)
  ) {
    throw new Error('Protected media signing secret must be at least 32 characters');
  }
  const acceptedSigningSecrets = [options.signingSecret, ...verificationSigningSecrets];
  const now = options.now ?? (() => new Date());

  return {
    async authorizeUpload(
      accountId: string,
      assetId: string,
      input: Readonly<{ purpose?: unknown; variant?: unknown; contentType?: unknown }>,
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
        const existing = await client.query<{
          accountId: string;
          purpose: string;
          deletionState: string;
        }>(
          `SELECT account_id AS "accountId",
                  purpose,
                  deletion_state AS "deletionState"
             FROM media_assets
            WHERE id = $1
            FOR UPDATE`,
          [assetId],
        );
        const current = existing.rows[0];
        if (current !== undefined) {
          if (current.accountId !== accountId) throw new ProtectedMediaError('not_found');
          if (current.purpose !== input.purpose || current.deletionState !== 'active') {
            throw new ProtectedMediaError('conflict');
          }
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

    async readAssetOriginal(accountId: string, assetId: string) {
      if (!UUID_PATTERN.test(assetId)) {
        throw new ProtectedMediaError('validation_failed');
      }
      const result = await options.pool.query<{
        purpose: string;
        originalStorageKey: string | null;
      }>(
        `SELECT purpose, original_storage_key AS "originalStorageKey"
           FROM media_assets
          WHERE id = $1
            AND account_id = $2
            AND deletion_state = 'active'`,
        [assetId, accountId],
      );
      const asset = result.rows[0];
      if (asset === undefined || asset.originalStorageKey === null) {
        throw new ProtectedMediaError('not_found');
      }
      if (asset.purpose !== 'evidence-working') {
        throw new ProtectedMediaError('conflict');
      }
      return options.blobStore.get('evidence-working', asset.originalStorageKey);
    },

    async deleteAsset(accountId: string, assetId: string) {
      if (!UUID_PATTERN.test(assetId)) {
        throw new ProtectedMediaError('validation_failed');
      }

      const client = await options.pool.connect();
      let asset:
        | Readonly<{
            purpose: MediaUploadPurpose;
            storageKey: string;
            originalStorageKey: string | null;
            thumbnailStorageKey: string | null;
            derivativeStorageKey: string | null;
            temporaryStorageKey: string | null;
            deletionState: string;
          }>
        | undefined;
      try {
        await client.query('BEGIN');
        const result = await client.query<{
          purpose: string;
          storageKey: string;
          originalStorageKey: string | null;
          thumbnailStorageKey: string | null;
          derivativeStorageKey: string | null;
          temporaryStorageKey: string | null;
          deletionState: string;
        }>(
          `SELECT
             purpose,
             storage_key AS "storageKey",
             original_storage_key AS "originalStorageKey",
             thumbnail_storage_key AS "thumbnailStorageKey",
             derivative_storage_key AS "derivativeStorageKey",
             temporary_storage_key AS "temporaryStorageKey",
             deletion_state AS "deletionState"
           FROM media_assets
           WHERE id = $1 AND account_id = $2
           FOR UPDATE`,
          [assetId, accountId],
        );
        const current = result.rows[0];
        if (current === undefined) throw new ProtectedMediaError('not_found');
        if (!isPurpose(current.purpose)) throw new ProtectedMediaError('conflict');
        asset = {
          ...current,
          purpose: current.purpose,
        };
        if (current.deletionState !== 'deleted') {
          await client.query(
            `UPDATE media_assets
                SET deletion_state = 'deleting',
                    retry_state = 'ready'
              WHERE id = $1 AND account_id = $2`,
            [assetId, accountId],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      if (asset.deletionState === 'deleted') {
        return { assetId, deleted: true as const };
      }

      const keys = [
        asset.storageKey,
        asset.originalStorageKey,
        asset.thumbnailStorageKey,
        asset.derivativeStorageKey,
        asset.temporaryStorageKey,
      ].filter((key): key is string => key !== null);
      const uniqueKeys = [...new Set(keys)];

      try {
        for (const key of uniqueKeys) {
          await options.blobStore.delete(asset.purpose, key);
        }
      } catch (error) {
        await options.pool.query(
          `UPDATE media_assets
              SET retry_state = 'retry_pending'
            WHERE id = $1 AND account_id = $2 AND deletion_state = 'deleting'`,
          [assetId, accountId],
        );
        throw error;
      }

      await options.pool.query(
        `UPDATE media_assets
            SET deletion_state = 'deleted',
                retry_state = 'ready'
          WHERE id = $1 AND account_id = $2 AND deletion_state = 'deleting'`,
        [assetId, accountId],
      );
      return { assetId, deleted: true as const };
    },

    async upload(accountId: string, token: string, body: unknown) {
      const claims = verifyToken(acceptedSigningSecrets, token, now());
      if (claims === null || claims.accountId !== accountId || !Buffer.isBuffer(body)) {
        throw new ProtectedMediaError('not_found');
      }
      if (!isValidImagePayload(body, claims.contentType)) {
        throw new ProtectedMediaError('validation_failed');
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
      await options.onUploadCommitted?.({
        accountId,
        assetId: claims.assetId,
        purpose: claims.purpose,
        variant: claims.variant,
      });
      return {
        assetId: claims.assetId,
        variant: claims.variant,
        uploaded: true as const,
      };
    },
  };
}

export type ProtectedMediaService = ReturnType<typeof createProtectedMediaService>;

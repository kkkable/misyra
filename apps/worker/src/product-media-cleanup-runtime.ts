import { createHmac } from 'node:crypto';

import { Pool } from 'pg';

import {
  createProductMediaCleanupService,
  type ProductMediaCleanupBlobStore,
  type ProductMediaCleanupResult,
} from './product-media-cleanup.js';

const AZURITE_ACCOUNT = 'devstoreaccount1';
const AZURITE_DEVELOPMENT_CREDENTIAL = [
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/',
  'K1SZFPTOtr/KBHBeksoGMGw==',
].join('');
const AZURE_STORAGE_VERSION = '2023-11-03';

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databaseUrl(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(env.POSTGRES_USER ?? 'misyra');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? 'misyra-local-only');
  const port = env.POSTGRES_PORT ?? '5432';
  const database = encodeURIComponent(env.POSTGRES_DB ?? 'misyra');
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
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

function signedAzuriteDeleteHeaders(url: URL) {
  const headers: Record<string, string> = {
    'x-ms-date': new Date().toUTCString(),
    'x-ms-delete-snapshots': 'include',
    'x-ms-version': AZURE_STORAGE_VERSION,
  };
  const stringToSign = `${[
    'DELETE',
    '',
    '',
    '',
    '',
    '',
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

function createAzuriteCleanupBlobStore(env: NodeJS.ProcessEnv): ProductMediaCleanupBlobStore {
  const port = env.AZURITE_BLOB_PORT ?? '10000';
  const endpoint = `http://127.0.0.1:${port}/${AZURITE_ACCOUNT}`;

  return {
    async delete(container, storageKey) {
      const url = new URL(`${endpoint}/${container}/${encodeBlobKey(storageKey)}`);
      const response = await fetch(url, {
        method: 'DELETE',
        headers: signedAzuriteDeleteHeaders(url),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error('Product media deletion failed');
      }
    },
  };
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

function createAzureCleanupBlobStore(env: NodeJS.ProcessEnv): ProductMediaCleanupBlobStore {
  const accountName = requiredEnv(env, 'AZURE_STORAGE_ACCOUNT_NAME');
  if (!/^[a-z0-9]{3,24}$/.test(accountName)) {
    throw new Error('AZURE_STORAGE_ACCOUNT_NAME is invalid');
  }
  let accessToken: Promise<string> | undefined;

  const token = async () => {
    accessToken ??= managedIdentityAccessToken(env);
    try {
      return await accessToken;
    } catch (error) {
      accessToken = undefined;
      throw error;
    }
  };

  return {
    async delete(container, storageKey) {
      const bearer = await token();
      const url = new URL(
        `https://${accountName}.blob.core.windows.net/${container}/${encodeBlobKey(storageKey)}`,
      );
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'x-ms-delete-snapshots': 'include',
          'x-ms-version': AZURE_STORAGE_VERSION,
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error('Product media deletion failed');
      }
    },
  };
}

export function createProductMediaCleanupBlobStore(
  env: NodeJS.ProcessEnv = process.env,
): ProductMediaCleanupBlobStore {
  if (env.AZURE_STORAGE_ACCOUNT_NAME || env.NODE_ENV === 'production') {
    return createAzureCleanupBlobStore(env);
  }
  return createAzuriteCleanupBlobStore(env);
}

export async function runProductMediaCleanupCommand(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProductMediaCleanupResult> {
  const pool = new Pool({ connectionString: databaseUrl(env) });
  try {
    const cleanup = createProductMediaCleanupService({
      pool,
      blobStore: createProductMediaCleanupBlobStore(env),
    });
    return await cleanup.runOnce();
  } finally {
    await pool.end();
  }
}

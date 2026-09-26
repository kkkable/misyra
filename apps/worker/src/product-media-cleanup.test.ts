import { createHmac, randomUUID } from 'node:crypto';

import {
  applyMigrations,
  createPostgresDeviceSettingsStore,
  createPostgresSyncStore,
} from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createProductMediaCleanupBlobStore,
  resolveProductMediaCleanupDatabaseUrl,
} from './product-media-cleanup-runtime.js';
import {
  createProductMediaCleanupService,
  type ProductMediaCleanupBlobStore,
} from './product-media-cleanup.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts085_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

const AZURITE_ACCOUNT = 'devstoreaccount1';
const AZURITE_KEY = [
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/',
  'K1SZFPTOtr/KBHBeksoGMGw==',
].join('');
const AZURE_STORAGE_VERSION = '2023-11-03';
const azuritePort = process.env.AZURITE_BLOB_PORT ?? '10000';
const azuriteEndpoint = `http://127.0.0.1:${azuritePort}/${AZURITE_ACCOUNT}`;

let pool: Pool;
let accountId: string;
let now = new Date('2026-09-21T12:00:00.000Z');

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
  let resource = `/${AZURITE_ACCOUNT}${url.pathname}`;
  for (const name of [...parameters.keys()].sort()) {
    resource += `\n${name}:${(parameters.get(name) ?? []).sort().join(',')}`;
  }
  return resource;
}

function signedHeaders(
  method: string,
  url: URL,
  body?: Buffer,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    'x-ms-date': new Date().toUTCString(),
    'x-ms-version': AZURE_STORAGE_VERSION,
    ...extra,
  };
  const contentLength = body && body.length > 0 ? String(body.length) : '';
  if (contentLength) headers['content-length'] = contentLength;
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
  ].join('\n')}\n${canonicalizedHeaders(headers)}${canonicalizedResource(url)}`;
  const signature = createHmac('sha256', Buffer.from(AZURITE_KEY, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  headers.authorization = `SharedKey ${AZURITE_ACCOUNT}:${signature}`;
  return headers;
}

async function ensureContainer(container: string) {
  const url = new URL(`${azuriteEndpoint}/${container}?restype=container`);
  const response = await fetch(url, { method: 'PUT', headers: signedHeaders('PUT', url) });
  expect([201, 409]).toContain(response.status);
}

async function putBlob(container: string, key: string, value = key) {
  await ensureContainer(container);
  const url = new URL(`${azuriteEndpoint}/${container}/${key}`);
  const body = Buffer.from(value);
  const response = await fetch(url, {
    method: 'PUT',
    headers: signedHeaders('PUT', url, body, {
      'content-type': 'application/octet-stream',
      'x-ms-blob-type': 'BlockBlob',
    }),
    body: new Uint8Array(body),
  });
  expect(response.status).toBe(201);
}

async function blobExists(container: string, key: string) {
  const url = new URL(`${azuriteEndpoint}/${container}/${key}`);
  const response = await fetch(url, { method: 'HEAD', headers: signedHeaders('HEAD', url) });
  if (response.status === 404) return false;
  expect(response.status).toBe(200);
  return true;
}

const azuriteBlobStore = createProductMediaCleanupBlobStore({
  NODE_ENV: 'test',
  AZURITE_BLOB_PORT: azuritePort,
});

async function seedAsset(input: {
  purpose: string;
  createdAt: string;
  deletionDueAt: string | null;
  keys: readonly string[];
}) {
  const assetId = randomUUID();
  const [cacheKey, originalKey, thumbnailKey, derivativeKey, temporaryKey] = input.keys;
  await pool.query(
    `INSERT INTO media_assets (
       id, account_id, purpose, storage_key,
       original_storage_key, thumbnail_storage_key, derivative_storage_key, temporary_storage_key,
       deletion_due_at, deletion_state, retry_state, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'ready', $10)`,
    [
      assetId,
      accountId,
      input.purpose,
      cacheKey,
      originalKey ?? null,
      thumbnailKey ?? null,
      derivativeKey ?? null,
      temporaryKey ?? null,
      input.deletionDueAt,
      input.createdAt,
    ],
  );
  for (const key of input.keys) await putBlob(input.purpose, key);
  return assetId;
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject)
     VALUES ($1, 'google', $2)`,
    [accountId, `mts085-${accountId}`],
  );
});

beforeEach(async () => {
  now = new Date('2026-09-21T12:00:00.000Z');
  await pool.query('DELETE FROM media_assets');
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-085 product-media cleanup and reconciliation', () => {
  it('fails closed when production cleanup database configuration is missing', () => {
    expect(() => resolveProductMediaCleanupDatabaseUrl({ NODE_ENV: 'production' })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
    expect(
      resolveProductMediaCleanupDatabaseUrl({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://configured.example/misyra',
      }),
    ).toBe('postgresql://configured.example/misyra');
  });

  it('time-travels across the exact deadline and hard-deletes cache/original/thumbnail/derivative/temporary Azurite blobs only when due', async () => {
    const keys = [
      `${accountId}/asset/cache`,
      `${accountId}/asset/original`,
      `${accountId}/asset/thumbnail`,
      `${accountId}/asset/derivative`,
      `${accountId}/asset/temporary`,
    ] as const;
    const assetId = await seedAsset({
      purpose: 'evidence-working',
      createdAt: '2026-08-22T12:00:00.000Z',
      deletionDueAt: '2026-09-21T12:00:00.000Z',
      keys,
    });
    const service = createProductMediaCleanupService({
      pool,
      blobStore: azuriteBlobStore,
      now: () => now,
    });

    now = new Date('2026-09-21T11:59:59.999Z');
    await expect(service.runOnce()).resolves.toEqual({ scanned: 0, deleted: 0, retryPending: 0 });
    for (const key of keys) expect(await blobExists('evidence-working', key)).toBe(true);

    now = new Date('2026-09-21T12:00:00.000Z');
    await expect(service.runOnce()).resolves.toEqual({ scanned: 1, deleted: 1, retryPending: 0 });
    for (const key of keys) expect(await blobExists('evidence-working', key)).toBe(false);

    const row = await pool.query<{
      deletionState: string;
      retryState: string;
      deletionAttemptCount: number;
      lastDeletionAttemptAt: Date;
      deletedAt: Date;
    }>(
      `SELECT
         deletion_state AS "deletionState",
         retry_state AS "retryState",
         deletion_attempt_count AS "deletionAttemptCount",
         last_deletion_attempt_at AS "lastDeletionAttemptAt",
         deleted_at AS "deletedAt"
       FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(row.rows[0]).toEqual({
      deletionState: 'deleted',
      retryState: 'ready',
      deletionAttemptCount: 1,
      lastDeletionAttemptAt: new Date('2026-09-21T12:00:00.000Z'),
      deletedAt: new Date('2026-09-21T12:00:00.000Z'),
    });
  });

  it('records retry_pending after partial storage failure and reconciles safely without marking final deletion early', async () => {
    const keys = [
      `${accountId}/retry/cache`,
      `${accountId}/retry/original`,
      `${accountId}/retry/thumbnail`,
      `${accountId}/retry/derivative`,
      `${accountId}/retry/temporary`,
    ] as const;
    const assetId = await seedAsset({
      purpose: 'story-working',
      createdAt: '2026-08-01T00:00:00.000Z',
      deletionDueAt: '2026-08-31T00:00:00.000Z',
      keys,
    });
    let failDerivative = true;
    const flakyStore: ProductMediaCleanupBlobStore = {
      async delete(container, key) {
        if (key.endsWith('/derivative') && failDerivative) {
          failDerivative = false;
          throw new Error('transient fixture failure');
        }
        await azuriteBlobStore.delete(container, key);
      },
    };
    const service = createProductMediaCleanupService({
      pool,
      blobStore: flakyStore,
      now: () => now,
    });

    await expect(service.runOnce()).resolves.toEqual({ scanned: 1, deleted: 0, retryPending: 1 });
    const retryRow = await pool.query<{
      deletionState: string;
      retryState: string;
      deletionAttemptCount: number;
      lastDeletionAttemptAt: Date;
      deletedAt: Date | null;
    }>(
      `SELECT
         deletion_state AS "deletionState",
         retry_state AS "retryState",
         deletion_attempt_count AS "deletionAttemptCount",
         last_deletion_attempt_at AS "lastDeletionAttemptAt",
         deleted_at AS "deletedAt"
       FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(retryRow.rows[0]).toEqual({
      deletionState: 'deleting',
      retryState: 'retry_pending',
      deletionAttemptCount: 1,
      lastDeletionAttemptAt: new Date('2026-09-21T12:00:00.000Z'),
      deletedAt: null,
    });
    expect(await blobExists('story-working', keys[3])).toBe(true);

    await expect(service.runOnce()).resolves.toEqual({ scanned: 1, deleted: 1, retryPending: 0 });
    for (const key of keys) expect(await blobExists('story-working', key)).toBe(false);
    const finalRow = await pool.query<{
      deletionState: string;
      retryState: string;
      deletionAttemptCount: number;
      deletedAt: Date;
    }>(
      `SELECT
         deletion_state AS "deletionState",
         retry_state AS "retryState",
         deletion_attempt_count AS "deletionAttemptCount",
         deleted_at AS "deletedAt"
       FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(finalRow.rows[0]).toEqual({
      deletionState: 'deleted',
      retryState: 'ready',
      deletionAttemptCount: 2,
      deletedAt: new Date('2026-09-21T12:00:00.000Z'),
    });
  });

  it('excludes separately retained feedback media while deleting due product media', async () => {
    const feedbackReportId = randomUUID();
    const feedbackAssetId = randomUUID();
    const feedbackKey = `${accountId}/feedback/screenshot`;
    await pool.query(
      `INSERT INTO feedback_reports (id, account_id, description, submitted_at)
       VALUES ($1, $2, 'MTS-085 retained feedback fixture', $3)`,
      [feedbackReportId, accountId, '2026-01-01T00:00:00.000Z'],
    );
    await pool.query(
      `INSERT INTO feedback_media_assets (id, feedback_report_id, storage_key, created_at)
       VALUES ($1, $2, $3, $4)`,
      [feedbackAssetId, feedbackReportId, feedbackKey, '2026-01-01T00:00:00.000Z'],
    );
    await putBlob('feedback-retained', feedbackKey);

    const productKey = `${accountId}/feedback-exclusion/product-cache`;
    await seedAsset({
      purpose: 'planner-working',
      createdAt: '2026-08-01T00:00:00.000Z',
      deletionDueAt: '2026-08-31T00:00:00.000Z',
      keys: [productKey],
    });
    const service = createProductMediaCleanupService({
      pool,
      blobStore: azuriteBlobStore,
      now: () => now,
    });

    await expect(service.runOnce()).resolves.toEqual({ scanned: 1, deleted: 1, retryPending: 0 });
    expect(await blobExists('planner-working', productKey)).toBe(false);
    expect(await blobExists('feedback-retained', feedbackKey)).toBe(true);
    const feedbackRow = await pool.query<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM feedback_media_assets WHERE id = $1`,
      [feedbackAssetId],
    );
    expect(feedbackRow.rows[0]?.storageKey).toBe(feedbackKey);
  });
});


async function seedMts099StoryDraft(createdAt: string) {
  const devices = createPostgresDeviceSettingsStore(pool);
  const deviceId = await devices.registerDevice({
    accountId,
    installationId: `mts099-${randomUUID()}`,
    platform: 'ios',
    appVersion: '1.0.0',
    notificationCapability: 'denied',
  });
  const occurrenceId = randomUUID();
  const seriesId = randomUUID();
  const store = createPostgresSyncStore(pool, () => new Date(createdAt));

  await store.push(accountId, [
    {
      mutationId: randomUUID(),
      accountId,
      deviceId,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'create',
      baseVersion: null,
      clientOccurredAt: createdAt,
      payload: {
        series: { id: seriesId, title: 'MTS-099 retained Story', recurrence: null },
        occurrence: {
          id: occurrenceId,
          seriesId,
          schedule: {
            localStart: '2026-08-22T13:00:00',
            localFinish: '2026-08-22T13:30:00',
            startInstant: '2026-08-22T13:00:00.000Z',
            finishInstant: '2026-08-22T13:30:00.000Z',
            timeZone: 'UTC',
            timeBehavior: 'local_time',
            allDay: false,
            estimatedEffortMinutes: null,
          },
          scheduleState: 'scheduled',
          completionState: 'incomplete',
          evidenceState: 'not_required',
          rewardEligibility: 'eligible',
          rewardIssuance: 'not_issued',
          calendarSource: 'internal',
          fieldOwnership: 'app_owned',
          synchronizationState: 'synced',
          storyState: 'none',
          deletionState: 'active',
        },
        location: null,
        notes: null,
      },
    },
  ]);

  await pool.query(
    `UPDATE mission_occurrences
        SET completion_state = 'completed',
            story_state = 'draft'
      WHERE id = $1 AND account_id = $2`,
    [occurrenceId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_completions
       (id, account_id, occurrence_id, completion_type, action_time)
     VALUES ($1, $2, $3, 'trust_mode', $4)`,
    [randomUUID(), accountId, occurrenceId, new Date(createdAt)],
  );

  const draftId = randomUUID();
  await pool.query(
    `INSERT INTO story_drafts (
       id, account_id, occurrence_id, state, notes,
       original_client_time, server_receipt_time, effective_save_time,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'active', $4::jsonb,
       $5, $5, $5, $5, $5
     )`,
    [
      draftId,
      accountId,
      occurrenceId,
      JSON.stringify({
        musicMood: 'retained mood',
        mention: '@misyra',
        location: 'Hong Kong',
        poll: null,
      }),
      new Date(createdAt),
    ],
  );
  await pool.query(
    `INSERT INTO story_style_profiles (account_id, profile, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (account_id) DO UPDATE
       SET profile = EXCLUDED.profile,
           updated_at = EXCLUDED.updated_at`,
    [accountId, JSON.stringify({ mode: 'custom', palette: ['#ffffff'] }), new Date(createdAt)],
  );

  return { draftId, occurrenceId };
}

describe('MTS-099 Story and style retention integration', () => {
  it('time-travels the exact 30-day deadline, deletes Story draft/media, and retains the abstract style profile', async () => {
    const createdAt = '2026-08-22T12:00:00.000Z';
    const dueAt = '2026-09-21T12:00:00.000Z';
    const { draftId } = await seedMts099StoryDraft(createdAt);
    const storyKeys = [
      `${accountId}/mts099/story/cache`,
      `${accountId}/mts099/story/original`,
      `${accountId}/mts099/story/thumbnail`,
      `${accountId}/mts099/story/derivative`,
      `${accountId}/mts099/story/temporary`,
    ] as const;
    const styleKeys = [
      `${accountId}/mts099/style/cache`,
      `${accountId}/mts099/style/original`,
      `${accountId}/mts099/style/thumbnail`,
      `${accountId}/mts099/style/derivative`,
      `${accountId}/mts099/style/temporary`,
    ] as const;
    await seedAsset({
      purpose: 'story-working',
      createdAt,
      deletionDueAt: dueAt,
      keys: storyKeys,
    });
    await seedAsset({
      purpose: 'style-references',
      createdAt,
      deletionDueAt: dueAt,
      keys: styleKeys,
    });
    const service = createProductMediaCleanupService({
      pool,
      blobStore: azuriteBlobStore,
      now: () => now,
    });

    now = new Date('2026-09-21T11:59:59.999Z');
    await expect(service.runOnce()).resolves.toEqual({ scanned: 0, deleted: 0, retryPending: 0 });
    expect((await pool.query('SELECT 1 FROM story_drafts WHERE id = $1', [draftId])).rowCount).toBe(
      1,
    );

    now = new Date(dueAt);
    await expect(service.runOnce()).resolves.toEqual({ scanned: 2, deleted: 2, retryPending: 0 });

    for (const key of storyKeys) expect(await blobExists('story-working', key)).toBe(false);
    for (const key of styleKeys) expect(await blobExists('style-references', key)).toBe(false);
    expect((await pool.query('SELECT 1 FROM story_drafts WHERE id = $1', [draftId])).rowCount).toBe(
      0,
    );
    expect(
      (await pool.query('SELECT profile FROM story_style_profiles WHERE account_id = $1', [accountId]))
        .rows[0]?.profile,
    ).toEqual({ mode: 'custom', palette: ['#ffffff'] });
  });
});

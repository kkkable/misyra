import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  applyMigrations,
  createPostgresAuthStore,
  createPostgresDeviceSettingsStore,
  createPostgresSyncStore,
} from '@misyra/database';
import {
  StoryImageGenerationBudgetExceededError,
  StoryImageGenerationSourceVersionError,
  createStoryImageGenerationService,
} from './story-image-generation.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts094_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
});
afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createStoryFixture() {
  const auth = createPostgresAuthStore(pool);
  const devices = createPostgresDeviceSettingsStore(pool);
  const account = await auth.findOrCreateAccount('google', `mts094-${randomUUID()}`);
  const deviceId = await devices.registerDevice({
    accountId: account.id,
    installationId: `mts094-${randomUUID()}`,
    platform: 'ios',
    appVersion: '1.0.0',
    notificationCapability: 'denied',
  });
  const occurrenceId = randomUUID();
  const seriesId = randomUUID();
  const store = createPostgresSyncStore(pool, () => new Date('2026-09-24T04:45:00.000Z'));

  await store.push(account.id, [
    {
      mutationId: randomUUID(),
      accountId: account.id,
      deviceId,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'create',
      baseVersion: null,
      clientOccurredAt: '2026-09-24T04:44:00.000Z',
      payload: {
        series: { id: seriesId, title: 'MTS-094 Story mission', recurrence: null },
        occurrence: {
          id: occurrenceId,
          seriesId,
          schedule: {
            localStart: '2026-09-24T14:00:00',
            localFinish: '2026-09-24T14:30:00',
            startInstant: '2026-09-24T05:00:00.000Z',
            finishInstant: '2026-09-24T05:30:00.000Z',
            timeZone: 'Asia/Tokyo',
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
            story_state = 'ready'
      WHERE id = $1 AND account_id = $2`,
    [occurrenceId, account.id],
  );
  await pool.query(
    `INSERT INTO mission_completions
       (id, account_id, occurrence_id, completion_type, action_time)
     VALUES ($1, $2, $3, 'trust_mode', $4)`,
    [randomUUID(), account.id, occurrenceId, new Date('2026-09-24T04:45:00.000Z')],
  );

  const draftId = randomUUID();
  const sourceVersionId = randomUUID();
  await pool.query(
    `INSERT INTO story_drafts (
       id, account_id, occurrence_id, state, ai_generation_count,
       original_client_time, server_receipt_time, effective_save_time
     )
     VALUES ($1, $2, $3, 'active', 0, $4, $4, $4)`,
    [draftId, account.id, occurrenceId, new Date('2026-09-24T04:45:00.000Z')],
  );
  await pool.query(
    `INSERT INTO story_image_versions (id, draft_id, kind, storage_key)
     VALUES ($1, $2, 'source', $3)`,
    [sourceVersionId, draftId, `story/source/${sourceVersionId}`],
  );

  return { accountId: account.id, deviceId, draftId, occurrenceId, sourceVersionId, store };
}

async function readGenerationState(draftId: string) {
  const budget = await pool.query<{ aiGenerationCount: number }>(
    `SELECT ai_generation_count AS "aiGenerationCount"
       FROM story_drafts
      WHERE id = $1`,
    [draftId],
  );
  const versions = await pool.query<{ kind: string; storageKey: string }>(
    `SELECT kind, storage_key AS "storageKey"
       FROM story_image_versions
      WHERE draft_id = $1
      ORDER BY created_at, id`,
    [draftId],
  );
  return {
    count: budget.rows[0]?.aiGenerationCount,
    versions: versions.rows,
  };
}

describe('MTS-094 Story image generation budget and versions', () => {
  it('atomically allows only three concurrent generation reservations', async () => {
    const fixture = await createStoryFixture();
    let serial = 0;
    const generateStoryImage = vi.fn(async () => {
      const current = ++serial;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { storageKey: `story/generated/concurrent-${String(current)}` };
    });
    const service = createStoryImageGenerationService({
      pool,
      gateway: { generateStoryImage },
    });

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.generate(fixture.accountId, {
          draftId: fixture.draftId,
          sourceVersionId: fixture.sourceVersionId,
        }),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      StoryImageGenerationBudgetExceededError,
    );
    expect(generateStoryImage).toHaveBeenCalledTimes(3);

    const state = await readGenerationState(fixture.draftId);
    expect(state.count).toBe(3);
    expect(state.versions.filter((version) => version.kind === 'generated')).toHaveLength(3);
    const remainingCounts = fulfilled.map((result) => result.value.remainingGenerations);
    expect(remainingCounts).toContain(0);
  });

  it('releases a reserved request when the provider fails', async () => {
    const fixture = await createStoryFixture();
    const providerFailure = new Error('deterministic provider failure');
    const generateStoryImage = vi.fn(() => Promise.reject(providerFailure));
    const service = createStoryImageGenerationService({
      pool,
      gateway: { generateStoryImage },
    });

    await expect(
      service.generate(fixture.accountId, {
        draftId: fixture.draftId,
        sourceVersionId: fixture.sourceVersionId,
      }),
    ).rejects.toBe(providerFailure);

    expect(await readGenerationState(fixture.draftId)).toEqual({
      count: 0,
      versions: [
        {
          kind: 'source',
          storageKey: `story/source/${fixture.sourceVersionId}`,
        },
      ],
    });
  });

  it('retains successful generated versions and consumes exactly one request each', async () => {
    const fixture = await createStoryFixture();
    const generatedStorageKeys = ['story/generated/retained-one', 'story/generated/retained-two'];
    const generateStoryImage = vi
      .fn()
      .mockResolvedValueOnce({ storageKey: generatedStorageKeys[0] })
      .mockResolvedValueOnce({ storageKey: generatedStorageKeys[1] });
    const service = createStoryImageGenerationService({
      pool,
      gateway: { generateStoryImage },
    });

    const first = await service.generate(fixture.accountId, {
      draftId: fixture.draftId,
      sourceVersionId: fixture.sourceVersionId,
    });
    const second = await service.generate(fixture.accountId, {
      draftId: fixture.draftId,
      sourceVersionId: fixture.sourceVersionId,
    });

    expect(first.remainingGenerations).toBe(2);
    expect(second.remainingGenerations).toBe(1);

    const state = await readGenerationState(fixture.draftId);
    expect(state.count).toBe(2);
    expect(state.versions).toEqual(
      expect.arrayContaining([
        { kind: 'source', storageKey: `story/source/${fixture.sourceVersionId}` },
        { kind: 'generated', storageKey: generatedStorageKeys[0] },
        { kind: 'generated', storageKey: generatedStorageKeys[1] },
      ]),
    );
    expect(state.versions).toHaveLength(3);
  });

  it('retains a server-generated version across a later source-only Story autosave', async () => {
    const fixture = await createStoryFixture();
    const storageKey = 'story/generated/autosave-retained';
    const service = createStoryImageGenerationService({
      pool,
      gateway: { generateStoryImage: vi.fn(() => Promise.resolve({ storageKey })) },
    });

    const generated = await service.generate(fixture.accountId, {
      draftId: fixture.draftId,
      sourceVersionId: fixture.sourceVersionId,
    });

    const savedAt = '2026-09-24T04:46:00.000Z';
    const mutationId = randomUUID();
    await expect(
      fixture.store.push(fixture.accountId, [
        {
          mutationId,
          accountId: fixture.accountId,
          deviceId: fixture.deviceId,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: savedAt,
          payload: {
            draftId: fixture.draftId,
            notes: { musicMood: null, mention: null, location: null, poll: null },
            imageVersions: [
              {
                id: fixture.sourceVersionId,
                kind: 'source',
                storageKey: `story/source/${fixture.sourceVersionId}`,
                composition: {
                  canvas: { width: 1080, height: 1920 },
                  background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
                  headline: null,
                  supportingText: null,
                  effects: [],
                  revision: 1,
                  savedAt,
                },
              },
            ],
          },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });

    const state = await readGenerationState(fixture.draftId);
    expect(state.count).toBe(1);
    expect(state.versions).toEqual(
      expect.arrayContaining([
        { kind: 'source', storageKey: `story/source/${fixture.sourceVersionId}` },
        { kind: 'generated', storageKey },
      ]),
    );
    expect(state.versions).toHaveLength(2);
    expect(generated.remainingGenerations).toBe(2);
  });
});


describe('MTS-095 generated Story version lifecycle', () => {
  it('creates a generated version with an empty independent composition', async () => {
    const fixture = await createStoryFixture();
    const savedAt = new Date('2026-09-24T06:30:00.000Z');
    const service = createStoryImageGenerationService({
      pool,
      gateway: {
        generateStoryImage: vi.fn(() =>
          Promise.resolve({ storageKey: 'story/generated/independent-composition' }),
        ),
      },
      now: () => savedAt,
    });

    const generated = await service.generate(fixture.accountId, {
      draftId: fixture.draftId,
      sourceVersionId: fixture.sourceVersionId,
    });
    const composition = await pool.query<{ composition: unknown }>(
      `SELECT composition
         FROM story_compositions
        WHERE draft_id = $1
          AND image_version_id = $2`,
      [fixture.draftId, generated.version.id],
    );

    expect(composition.rows[0]?.composition).toEqual({
      canvas: { width: 1080, height: 1920 },
      background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
      headline: null,
      supportingText: null,
      effects: [],
      revision: 0,
      savedAt: savedAt.toISOString(),
    });
  });

  it('reads and safely deletes only generated versions with their composition', async () => {
    const fixture = await createStoryFixture();
    const bytes = Buffer.from('generated-story-version');
    const get = vi.fn(() => Promise.resolve(bytes));
    const deleteBlob = vi.fn(() => Promise.resolve());
    const put = vi.fn(() => Promise.resolve());
    const service = createStoryImageGenerationService({
      pool,
      gateway: {
        generateStoryImage: vi.fn(() =>
          Promise.resolve({ storageKey: 'story/generated/delete-me' }),
        ),
      },
      blobStore: { get, delete: deleteBlob, put },
      now: () => new Date('2026-09-24T06:31:00.000Z'),
    });

    const generated = await service.generate(fixture.accountId, {
      draftId: fixture.draftId,
      sourceVersionId: fixture.sourceVersionId,
    });

    await expect(
      service.getVersionMedia(fixture.accountId, fixture.draftId, generated.version.id),
    ).resolves.toEqual(bytes);
    expect(get).toHaveBeenCalledWith('story-working', generated.version.storageKey);

    await expect(
      service.deleteVersion(fixture.accountId, fixture.draftId, generated.version.id),
    ).resolves.toEqual({ versionId: generated.version.id, deleted: true });
    expect(deleteBlob).toHaveBeenCalledWith('story-working', generated.version.storageKey);

    const remaining = await pool.query<{ versions: number; compositions: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM story_image_versions WHERE id = $1) AS versions,
         (SELECT COUNT(*)::int FROM story_compositions WHERE image_version_id = $1) AS compositions`,
      [generated.version.id],
    );
    expect(remaining.rows[0]).toEqual({ versions: 0, compositions: 0 });

    await expect(
      service.deleteVersion(fixture.accountId, fixture.draftId, fixture.sourceVersionId),
    ).rejects.toBeInstanceOf(StoryImageGenerationSourceVersionError);
    expect(put).not.toHaveBeenCalled();
  });
});

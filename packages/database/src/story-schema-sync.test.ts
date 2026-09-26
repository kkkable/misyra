import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts090_${randomUUID().replaceAll('-', '')}`;
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

async function createMissionFixture(completed: boolean) {
  const auth = createPostgresAuthStore(pool);
  const devices = createPostgresDeviceSettingsStore(pool);
  const account = await auth.findOrCreateAccount('google', `mts090-${randomUUID()}`);
  const firstDevice = await devices.registerDevice({
    accountId: account.id,
    installationId: `mts090-first-${randomUUID()}`,
    platform: 'ios',
    appVersion: '1.0.0',
    notificationCapability: 'denied',
  });
  const secondDevice = await devices.registerDevice({
    accountId: account.id,
    installationId: `mts090-second-${randomUUID()}`,
    platform: 'android',
    appVersion: '1.0.0',
    notificationCapability: 'denied',
  });
  const occurrenceId = randomUUID();
  const seriesId = randomUUID();
  const store = createPostgresSyncStore(pool, () => new Date('2026-09-22T09:45:00.000Z'));

  await store.push(account.id, [
    {
      mutationId: randomUUID(),
      accountId: account.id,
      deviceId: firstDevice,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'create',
      baseVersion: null,
      clientOccurredAt: '2026-09-22T09:44:00.000Z',
      payload: {
        series: {
          id: seriesId,
          title: 'Completed Story mission',
          recurrence: null,
        },
        occurrence: {
          id: occurrenceId,
          seriesId,
          schedule: {
            localStart: '2026-09-23T18:00:00',
            localFinish: '2026-09-23T18:30:00',
            startInstant: '2026-09-23T09:00:00.000Z',
            finishInstant: '2026-09-23T09:30:00.000Z',
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

  if (completed) {
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
      [randomUUID(), account.id, occurrenceId, new Date('2026-09-23T09:31:00.000Z')],
    );
  }

  return { account, firstDevice, secondDevice, occurrenceId, store };
}

function composition(label: string, revision: number, savedAt: string) {
  return {
    canvas: { width: 1080, height: 1920 },
    background: {
      scale: 1,
      translateX: revision * 10,
      translateY: revision * -5,
      rotation: 0,
    },
    headline: { text: label, x: 120, y: 240 },
    supportingText: null,
    effects: [{ kind: 'grain', amount: revision / 10 }],
    revision,
    savedAt,
  };
}

function storyPayload(
  draftId: string,
  sourceVersionId: string,
  generatedVersionId: string,
  label: string,
  revision: number,
  savedAt: string,
) {
  return {
    draftId,
    notes: {
      musicMood: `${label} mood`,
      mention: null,
      location: null,
      poll: null,
    },
    imageVersions: [
      {
        id: sourceVersionId,
        kind: 'source',
        storageKey: `story/source/${sourceVersionId}`,
        composition: composition(`${label} source`, revision, savedAt),
      },
      {
        id: generatedVersionId,
        kind: 'generated',
        storageKey: `story/generated/${generatedVersionId}`,
        composition: composition(`${label} generated`, revision + 1, savedAt),
      },
    ],
  };
}

describe('MTS-090/MTS-096 Story schema and synchronization contracts', () => {
  it('persists a separate serialized composition for every image version', async () => {
    const { account, occurrenceId } = await createMissionFixture(true);
    const draftId = randomUUID();
    const sourceVersionId = randomUUID();
    const generatedVersionId = randomUUID();

    await pool.query(
      `INSERT INTO story_drafts
         (id, account_id, occurrence_id, state, notes, revision,
          original_client_time, server_receipt_time, effective_save_time, validation_result)
       VALUES ($1, $2, $3, 'active', $4::jsonb, 2, $5, $6, $5, 'valid')`,
      [
        draftId,
        account.id,
        occurrenceId,
        JSON.stringify({ musicMood: 'quiet', mention: null, location: null, poll: null }),
        new Date('2026-09-23T09:32:00.000Z'),
        new Date('2026-09-23T09:32:01.000Z'),
      ],
    );
    await pool.query(
      `INSERT INTO story_image_versions (id, draft_id, kind, storage_key)
       VALUES ($1, $3, 'source', $4), ($2, $3, 'generated', $5)`,
      [
        sourceVersionId,
        generatedVersionId,
        draftId,
        `story/source/${sourceVersionId}`,
        `story/generated/${generatedVersionId}`,
      ],
    );
    await pool.query(
      `INSERT INTO story_compositions
         (id, draft_id, image_version_id, composition, revision, saved_at)
       VALUES
         ($1, $3, $4, $6::jsonb, 1, $8),
         ($2, $3, $5, $7::jsonb, 2, $8)`,
      [
        randomUUID(),
        randomUUID(),
        draftId,
        sourceVersionId,
        generatedVersionId,
        JSON.stringify(composition('source', 1, '2026-09-23T09:32:00.000Z')),
        JSON.stringify(composition('generated', 2, '2026-09-23T09:32:00.000Z')),
        new Date('2026-09-23T09:32:00.000Z'),
      ],
    );

    const rows = await pool.query<{
      imageVersionId: string;
      composition: Record<string, unknown>;
      revision: number;
    }>(
      `SELECT image_version_id AS "imageVersionId", composition, revision
         FROM story_compositions
        WHERE draft_id = $1
        ORDER BY revision`,
      [draftId],
    );

    expect(rows.rows).toEqual([
      {
        imageVersionId: sourceVersionId,
        composition: composition('source', 1, '2026-09-23T09:32:00.000Z'),
        revision: 1,
      },
      {
        imageVersionId: generatedVersionId,
        composition: composition('generated', 2, '2026-09-23T09:32:00.000Z'),
        revision: 2,
      },
    ]);

    await expect(
      pool.query(
        `INSERT INTO story_compositions
           (id, draft_id, image_version_id, composition, revision, saved_at)
         VALUES ($1, $2, $3, '{}'::jsonb, 3, now())`,
        [randomUUID(), draftId, sourceVersionId],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('requires a completed mission before accepting a Story draft', async () => {
    const fixture = await createMissionFixture(false);
    const draftId = randomUUID();
    const sourceVersionId = randomUUID();
    const generatedVersionId = randomUUID();
    const payload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'incomplete',
      1,
      '2026-09-23T09:32:00.000Z',
    );

    await expect(
      fixture.store.push(fixture.account.id, [
        {
          mutationId: randomUUID(),
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-23T09:32:00.000Z',
          payload,
        },
      ]),
    ).rejects.toThrow(/completed/i);

    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed',
              story_state = 'ready'
        WHERE id = $1 AND account_id = $2`,
      [fixture.occurrenceId, fixture.account.id],
    );
    await pool.query(
      `INSERT INTO mission_completions
         (id, account_id, occurrence_id, completion_type, action_time)
       VALUES ($1, $2, $3, 'trust_mode', $4)`,
      [
        randomUUID(),
        fixture.account.id,
        fixture.occurrenceId,
        new Date('2026-09-23T09:31:00.000Z'),
      ],
    );

    const mutationId = randomUUID();
    await expect(
      fixture.store.push(fixture.account.id, [
        {
          mutationId,
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-23T09:32:00.000Z',
          payload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });
  });

  it('keeps the latest valid Story save and reports the losing mutation as a conflict', async () => {
    const fixture = await createMissionFixture(true);
    const draftId = randomUUID();
    const sourceVersionId = randomUUID();
    const generatedVersionId = randomUUID();

    const firstPayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'first',
      1,
      '2026-09-23T09:32:00.000Z',
    );
    const newestPayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'newest',
      3,
      '2026-09-23T09:34:00.000Z',
    );
    const stalePayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'stale',
      2,
      '2026-09-23T09:33:00.000Z',
    );

    for (const [deviceId, occurredAt, payload] of [
      [fixture.firstDevice, '2026-09-23T09:32:00.000Z', firstPayload],
      [fixture.secondDevice, '2026-09-23T09:34:00.000Z', newestPayload],
    ] as const) {
      const mutationId = randomUUID();
      await expect(
        fixture.store.push(fixture.account.id, [
          {
            mutationId,
            accountId: fixture.account.id,
            deviceId,
            entityType: 'story',
            entityId: fixture.occurrenceId,
            operation: 'update',
            baseVersion: null,
            clientOccurredAt: occurredAt,
            payload,
          },
        ]),
      ).resolves.toEqual({ acceptedMutationIds: [mutationId] });
    }

    const staleMutationId = randomUUID();
    const staleMutation = {
      mutationId: staleMutationId,
      accountId: fixture.account.id,
      deviceId: fixture.firstDevice,
      entityType: 'story',
      entityId: fixture.occurrenceId,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt: '2026-09-23T09:33:00.000Z',
      payload: stalePayload,
    } as const;
    const expectedConflict = {
      acceptedMutationIds: [],
      conflicts: [
        {
          kind: 'story_updated',
          mutationId: staleMutationId,
          storyDraftId: draftId,
        },
      ],
    };
    await expect(fixture.store.push(fixture.account.id, [staleMutation])).resolves.toEqual(
      expectedConflict,
    );
    await expect(fixture.store.push(fixture.account.id, [staleMutation])).resolves.toEqual(
      expectedConflict,
    );

    const current = await pool.query<{
      notes: Record<string, unknown>;
      revision: number;
      effectiveSaveTime: Date;
    }>(
      `SELECT notes,
              revision,
              effective_save_time AS "effectiveSaveTime"
         FROM story_drafts
        WHERE account_id = $1
          AND occurrence_id = $2
          AND state = 'active'`,
      [fixture.account.id, fixture.occurrenceId],
    );

    expect(current.rows).toEqual([
      {
        notes: newestPayload.notes,
        revision: 4,
        effectiveSaveTime: new Date('2026-09-23T09:34:00.000Z'),
      },
    ]);

    const pulled = await fixture.store.pull(fixture.account.id, { cursor: 3, limit: 10 });
    expect(pulled).toMatchObject({
      kind: 'incremental',
      changes: [
        {
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'upsert',
          payload: newestPayload,
        },
      ],
    });
  });

  it('uses receipt time silently when a Story save has an invalid device timestamp', async () => {
    const fixture = await createMissionFixture(true);
    const draftId = randomUUID();
    const sourceVersionId = randomUUID();
    const generatedVersionId = randomUUID();
    const receiptTime = new Date('2026-09-23T09:35:00.000Z');
    const store = createPostgresSyncStore(pool, () => receiptTime);

    const firstMutationId = randomUUID();
    await expect(
      store.push(fixture.account.id, [
        {
          mutationId: firstMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-23T09:34:00.000Z',
          payload: storyPayload(
            draftId,
            sourceVersionId,
            generatedVersionId,
            'valid',
            1,
            '2026-09-23T09:34:00.000Z',
          ),
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [firstMutationId] });

    const invalidMutationId = randomUUID();
    const invalidPayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'receipt-fallback',
      2,
      receiptTime.toISOString(),
    );
    await expect(
      store.push(fixture.account.id, [
        {
          mutationId: invalidMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.secondDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: 'not-a-valid-device-time',
          payload: invalidPayload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [invalidMutationId] });

    const current = await pool.query<{
      notes: Record<string, unknown>;
      originalClientTime: Date;
      serverReceiptTime: Date;
      effectiveSaveTime: Date;
      validationResult: string;
    }>(
      `SELECT notes,
              original_client_time AS "originalClientTime",
              server_receipt_time AS "serverReceiptTime",
              effective_save_time AS "effectiveSaveTime",
              validation_result AS "validationResult"
         FROM story_drafts
        WHERE account_id = $1
          AND occurrence_id = $2
          AND state = 'active'`,
      [fixture.account.id, fixture.occurrenceId],
    );

    expect(current.rows).toEqual([
      {
        notes: invalidPayload.notes,
        originalClientTime: receiptTime,
        serverReceiptTime: receiptTime,
        effectiveSaveTime: receiptTime,
        validationResult: 'invalid_replaced',
      },
    ]);
  });

  it('breaks equal Story save times deterministically by mutation id after receipt time', async () => {
    const fixture = await createMissionFixture(true);
    const draftId = randomUUID();
    const sourceVersionId = randomUUID();
    const generatedVersionId = randomUUID();
    const savedAt = '2026-09-23T09:34:00.000Z';
    const higherPayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'higher-id',
      5,
      savedAt,
    );
    const lowerPayload = storyPayload(
      draftId,
      sourceVersionId,
      generatedVersionId,
      'lower-id',
      5,
      savedAt,
    );
    const higherMutationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const lowerMutationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      fixture.store.push(fixture.account.id, [
        {
          mutationId: higherMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: savedAt,
          payload: higherPayload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [higherMutationId] });

    await expect(
      fixture.store.push(fixture.account.id, [
        {
          mutationId: lowerMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: savedAt,
          payload: lowerPayload,
        },
      ]),
    ).resolves.toEqual({
      acceptedMutationIds: [],
      conflicts: [
        {
          kind: 'story_updated',
          mutationId: lowerMutationId,
          storyDraftId: draftId,
        },
      ],
    });

    const current = await pool.query<{
      notes: Record<string, unknown>;
      winnerMutationId: string;
    }>(
      `SELECT notes, winner_mutation_id AS "winnerMutationId"
         FROM story_drafts
        WHERE account_id = $1
          AND occurrence_id = $2
          AND state = 'active'`,
      [fixture.account.id, fixture.occurrenceId],
    );

    expect(current.rows).toEqual([
      {
        notes: higherPayload.notes,
        winnerMutationId: higherMutationId,
      },
    ]);
  });
});


describe('MTS-099 Story retention replacement', () => {
  it('allows a fresh Create Story to replace an active draft at the exact 30-day deadline', async () => {
    const fixture = await createMissionFixture(true);
    const firstDraftId = randomUUID();
    const firstSourceId = randomUUID();
    const firstGeneratedId = randomUUID();
    const createdAt = '2026-09-23T09:32:00.000Z';
    const firstPayload = storyPayload(
      firstDraftId,
      firstSourceId,
      firstGeneratedId,
      'retention-old',
      1,
      createdAt,
    );
    const firstMutationId = randomUUID();

    await expect(
      fixture.store.push(fixture.account.id, [
        {
          mutationId: firstMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.firstDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'create',
          baseVersion: null,
          clientOccurredAt: createdAt,
          payload: firstPayload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [firstMutationId] });

    const replacementAt = new Date('2026-10-23T09:32:00.000Z');
    const replacementStore = createPostgresSyncStore(pool, () => replacementAt);
    const replacementDraftId = randomUUID();
    const replacementSourceId = randomUUID();
    const replacementGeneratedId = randomUUID();
    const replacementPayload = storyPayload(
      replacementDraftId,
      replacementSourceId,
      replacementGeneratedId,
      'retention-new',
      1,
      replacementAt.toISOString(),
    );
    const replacementMutationId = randomUUID();

    await expect(
      replacementStore.push(fixture.account.id, [
        {
          mutationId: replacementMutationId,
          accountId: fixture.account.id,
          deviceId: fixture.secondDevice,
          entityType: 'story',
          entityId: fixture.occurrenceId,
          operation: 'create',
          baseVersion: null,
          clientOccurredAt: replacementAt.toISOString(),
          payload: replacementPayload,
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [replacementMutationId] });

    const current = await pool.query<{ id: string; storyState: string }>(
      `SELECT draft.id,
              occurrence.story_state AS "storyState"
         FROM story_drafts draft
         JOIN mission_occurrences occurrence
           ON occurrence.id = draft.occurrence_id
          AND occurrence.account_id = draft.account_id
        WHERE draft.account_id = $1
          AND draft.occurrence_id = $2
          AND draft.state = 'active'`,
      [fixture.account.id, fixture.occurrenceId],
    );
    expect(current.rows).toEqual([{ id: replacementDraftId, storyState: 'draft' }]);
  });
});

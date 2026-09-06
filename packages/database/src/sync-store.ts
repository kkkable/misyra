import type { Pool, PoolClient, QueryResultRow } from 'pg';

import {
  appendAccountChange,
  getAccountSnapshot,
  pullAccountChanges,
  type AccountChange,
} from './account-change-log.js';

export type StoredSyncMutation = Readonly<{
  mutationId: string;
  accountId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: string;
  baseVersion: number | null;
  clientOccurredAt: string;
  payload: unknown;
}>;

export type StoredSyncPushResult = Readonly<{
  acceptedMutationIds: readonly string[];
}>;

export type StoredSyncPullResult =
  | Readonly<{
      kind: 'incremental';
      changes: readonly AccountChange[];
      nextCursor: number;
      hasMore: boolean;
    }>
  | Readonly<{
      kind: 'snapshot_required';
      reason: 'invalid_cursor' | 'expired_cursor';
      nextCursor: number;
    }>;

export class SyncDeviceOwnershipError extends Error {
  constructor() {
    super('Sync device does not belong to the authenticated account');
    this.name = 'SyncDeviceOwnershipError';
  }
}

export class SyncMutationConflictError extends Error {
  constructor() {
    super('Sync mutation identifier was reused with a different mutation');
    this.name = 'SyncMutationConflictError';
  }
}

export class SyncMutationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncMutationValidationError';
  }
}

interface MutationMatchRow extends QueryResultRow {
  exactMatch: boolean;
}

interface SettingsRow extends QueryResultRow {
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}

type SettingsPatch = Readonly<{
  language?: 'en' | 'zh-HK';
  trustMode?: boolean;
}>;

type ClientTiming = Readonly<{
  clientOccurredAt: Date;
  effectiveTime: Date;
  validationResult: 'valid' | 'invalid_replaced';
}>;

function resolveClientTiming(source: string, serverReceiptTime: Date): ClientTiming {
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) {
    return {
      clientOccurredAt: serverReceiptTime,
      effectiveTime: serverReceiptTime,
      validationResult: 'invalid_replaced',
    };
  }
  return {
    clientOccurredAt: parsed,
    effectiveTime: parsed,
    validationResult: 'valid',
  };
}

function assertExecutableMutationShape(mutation: StoredSyncMutation): void {
  if (mutation.entityType !== 'settings') {
    throw new SyncMutationValidationError(
      `No executable server projector is registered for ${mutation.entityType}`,
    );
  }
  if (mutation.entityId !== mutation.accountId) {
    throw new SyncMutationValidationError('Settings mutations must target the authenticated account');
  }
  if (mutation.operation !== 'update') {
    throw new SyncMutationValidationError('Settings synchronization only supports update operations');
  }
}

function changeOperation(operation: string): 'upsert' | 'delete' {
  return operation === 'delete' ? 'delete' : 'upsert';
}

function parseSettingsPatch(payload: unknown): SettingsPatch {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SyncMutationValidationError('Settings mutation payload must be an object');
  }
  const source = payload as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length === 0 || keys.some((key) => key !== 'language' && key !== 'trustMode')) {
    throw new SyncMutationValidationError('Settings mutation contains unsupported fields');
  }
  const patch: { language?: 'en' | 'zh-HK'; trustMode?: boolean } = {};
  if (Object.hasOwn(source, 'language')) {
    if (source.language !== 'en' && source.language !== 'zh-HK') {
      throw new SyncMutationValidationError('Settings language must be en or zh-HK');
    }
    patch.language = source.language;
  }
  if (Object.hasOwn(source, 'trustMode')) {
    if (typeof source.trustMode !== 'boolean') {
      throw new SyncMutationValidationError('Trust Mode must be boolean');
    }
    patch.trustMode = source.trustMode;
  }
  return patch;
}

async function requireDeviceOwnership(
  client: PoolClient,
  accountId: string,
  deviceId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
       FROM devices
      WHERE id = $1 AND account_id = $2`,
    [deviceId, accountId],
  );
  if (result.rowCount !== 1) throw new SyncDeviceOwnershipError();
}

async function existingMutationMatches(
  client: PoolClient,
  mutation: StoredSyncMutation,
  timing: ClientTiming,
): Promise<boolean | null> {
  const result = await client.query<MutationMatchRow>(
    `SELECT
       account_id = $2
       AND device_id = $3
       AND entity_type = $4
       AND entity_id = $5
       AND operation = $6
       AND base_version IS NOT DISTINCT FROM $7
       AND validation_result = $8
       AND ($8 = 'invalid_replaced' OR client_occurred_at = $9)
       AND payload = $10::jsonb AS "exactMatch"
     FROM device_sync_mutations
     WHERE id = $1
     FOR UPDATE`,
    [
      mutation.mutationId,
      mutation.accountId,
      mutation.deviceId,
      mutation.entityType,
      mutation.entityId,
      mutation.operation,
      mutation.baseVersion,
      timing.validationResult,
      timing.clientOccurredAt,
      JSON.stringify(mutation.payload),
    ],
  );
  return result.rows[0]?.exactMatch ?? null;
}

async function applySettingsMutation(
  client: PoolClient,
  accountId: string,
  operation: string,
  payload: unknown,
): Promise<SettingsRow> {
  if (operation === 'delete') {
    throw new SyncMutationValidationError('Account settings cannot be deleted');
  }
  const patch = parseSettingsPatch(payload);
  const result = await client.query<SettingsRow>(
    `INSERT INTO user_settings (account_id, language, trust_mode)
     VALUES ($1, COALESCE($2::text, 'en'), COALESCE($3::boolean, false))
     ON CONFLICT (account_id)
     DO UPDATE SET
       language = COALESCE($2::text, user_settings.language),
       trust_mode = COALESCE($3::boolean, user_settings.trust_mode),
       updated_at = now()
     RETURNING language, trust_mode AS "trustMode"`,
    [accountId, patch.language ?? null, patch.trustMode ?? null],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Settings sync update returned no row');
  return row;
}

async function acceptMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  serverReceiptTime: Date,
): Promise<void> {
  assertExecutableMutationShape(mutation);
  await requireDeviceOwnership(client, mutation.accountId, mutation.deviceId);
  const timing = resolveClientTiming(mutation.clientOccurredAt, serverReceiptTime);

  const existingMatch = await existingMutationMatches(client, mutation, timing);
  if (existingMatch === true) return;
  if (existingMatch === false) throw new SyncMutationConflictError();

  const authoritativePayload = await applySettingsMutation(
    client,
    mutation.accountId,
    mutation.operation,
    mutation.payload,
  );

  await client.query(
    `INSERT INTO device_sync_mutations (
       id,
       account_id,
       device_id,
       entity_type,
       entity_id,
       operation,
       base_version,
       client_occurred_at,
       server_receipt_time,
       effective_time,
       validation_result,
       payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      mutation.mutationId,
      mutation.accountId,
      mutation.deviceId,
      mutation.entityType,
      mutation.entityId,
      mutation.operation,
      mutation.baseVersion,
      timing.clientOccurredAt,
      serverReceiptTime,
      timing.effectiveTime,
      timing.validationResult,
      JSON.stringify(mutation.payload),
    ],
  );

  await appendAccountChange(client, {
    accountId: mutation.accountId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: changeOperation(mutation.operation),
    payload: authoritativePayload,
  });
}

export function createPostgresSyncStore(pool: Pool, now: () => Date = () => new Date()) {
  return {
    async push(
      accountId: string,
      mutations: readonly StoredSyncMutation[],
    ): Promise<StoredSyncPushResult> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const acceptedMutationIds: string[] = [];
        for (const mutation of mutations) {
          if (mutation.accountId !== accountId) throw new SyncDeviceOwnershipError();
          await acceptMutation(client, mutation, now());
          acceptedMutationIds.push(mutation.mutationId);
        }
        await client.query('COMMIT');
        return { acceptedMutationIds };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async pull(
      accountId: string,
      input: Readonly<{ cursor: number; limit: number }>,
    ): Promise<StoredSyncPullResult> {
      const page = await pullAccountChanges(pool, {
        accountId,
        cursor: input.cursor,
        limit: input.limit + 1,
      });
      if (page.kind === 'snapshot_required') return page;

      const hasMore = page.changes.length > input.limit;
      const changes = hasMore ? page.changes.slice(0, input.limit) : page.changes;
      return {
        kind: 'incremental',
        changes,
        nextCursor: changes.at(-1)?.sequence ?? input.cursor,
        hasMore,
      };
    },

    snapshot(accountId: string) {
      return getAccountSnapshot(pool, accountId);
    },
  };
}

export type PostgresSyncStore = ReturnType<typeof createPostgresSyncStore>;

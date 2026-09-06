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

interface MutationMatchRow extends QueryResultRow {
  exactMatch: boolean;
}

function effectiveClientTime(source: string, serverReceiptTime: Date) {
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) {
    return {
      clientOccurredAt: serverReceiptTime,
      effectiveTime: serverReceiptTime,
      validationResult: 'invalid_replaced',
    } as const;
  }
  return {
    clientOccurredAt: parsed,
    effectiveTime: parsed,
    validationResult: 'valid',
  } as const;
}

function changeOperation(operation: string): 'upsert' | 'delete' {
  return operation === 'delete' ? 'delete' : 'upsert';
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
): Promise<boolean | null> {
  const result = await client.query<MutationMatchRow>(
    `SELECT
       account_id = $2
       AND device_id = $3
       AND entity_type = $4
       AND entity_id = $5
       AND operation = $6
       AND base_version IS NOT DISTINCT FROM $7
       AND client_occurred_at = $8::timestamptz
       AND payload = $9::jsonb AS "exactMatch"
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
      mutation.clientOccurredAt,
      JSON.stringify(mutation.payload),
    ],
  );
  return result.rows[0]?.exactMatch ?? null;
}

async function acceptMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  serverReceiptTime: Date,
): Promise<void> {
  await requireDeviceOwnership(client, mutation.accountId, mutation.deviceId);

  const existingMatch = await existingMutationMatches(client, mutation);
  if (existingMatch === true) return;
  if (existingMatch === false) throw new SyncMutationConflictError();

  const timing = effectiveClientTime(mutation.clientOccurredAt, serverReceiptTime);
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
    payload: mutation.operation === 'delete' ? null : mutation.payload,
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

import type { Pool, PoolClient } from 'pg';

export type AccountChangeOperation = 'upsert' | 'delete' | 'conflict';

export interface AppendAccountChangeInput {
  accountId: string;
  entityType: string;
  entityId: string;
  operation: AccountChangeOperation;
  payload: unknown | null;
}

export interface AccountChange {
  accountId: string;
  sequence: number;
  entityType: string;
  entityId: string;
  operation: AccountChangeOperation;
  payload: unknown | null;
}

export interface IncrementalChangePage {
  kind: 'incremental';
  changes: AccountChange[];
  nextCursor: number;
}

export interface SnapshotRequired {
  kind: 'snapshot_required';
  reason: 'invalid_cursor' | 'expired_cursor';
  nextCursor: number;
}

export interface AccountSnapshot {
  entries: AccountChange[];
  nextCursor: number;
}

async function currentCursor(client: Pool | PoolClient, accountId: string): Promise<number> {
  const result = await client.query<{ cursor: string | number | null }>(
    `SELECT max(sequence) AS cursor FROM account_change_log WHERE account_id = $1`,
    [accountId],
  );
  return Number(result.rows[0]?.cursor ?? 0);
}

export async function appendAccountChange(
  pool: Pool,
  input: AppendAccountChangeInput,
): Promise<AccountChange> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.accountId]);
    const nextResult = await client.query<{ sequence: string | number }>(
      `SELECT coalesce(max(sequence), 0) + 1 AS sequence
       FROM account_change_log
       WHERE account_id = $1`,
      [input.accountId],
    );
    const sequence = Number(nextResult.rows[0]?.sequence ?? 1);
    await client.query(
      `INSERT INTO account_change_log
       (account_id, sequence, entity_type, entity_id, operation, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.accountId,
        sequence,
        input.entityType,
        input.entityId,
        input.operation,
        input.payload === null ? null : JSON.stringify(input.payload),
      ],
    );
    await client.query('COMMIT');
    return { ...input, sequence };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function pullAccountChanges(
  pool: Pool,
  input: { accountId: string; cursor: number; limit?: number },
): Promise<IncrementalChangePage | SnapshotRequired> {
  const latest = await currentCursor(pool, input.accountId);
  if (!Number.isSafeInteger(input.cursor) || input.cursor < 0 || input.cursor > latest) {
    return { kind: 'snapshot_required', reason: 'invalid_cursor', nextCursor: latest };
  }

  const oldestResult = await pool.query<{ sequence: string | number | null }>(
    `SELECT min(sequence) AS sequence FROM account_change_log WHERE account_id = $1`,
    [input.accountId],
  );
  const oldest = Number(oldestResult.rows[0]?.sequence ?? 0);
  if (oldest > 0 && input.cursor < oldest - 1) {
    return { kind: 'snapshot_required', reason: 'expired_cursor', nextCursor: latest };
  }

  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const result = await pool.query<{
    account_id: string;
    sequence: string | number;
    entity_type: string;
    entity_id: string;
    operation: AccountChangeOperation;
    payload: unknown | null;
  }>(
    `SELECT account_id, sequence, entity_type, entity_id, operation, payload
     FROM account_change_log
     WHERE account_id = $1 AND sequence > $2
     ORDER BY sequence ASC
     LIMIT $3`,
    [input.accountId, input.cursor, limit],
  );

  const changes = result.rows.map((row) => ({
    accountId: row.account_id,
    sequence: Number(row.sequence),
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    payload: row.payload,
  }));

  return {
    kind: 'incremental',
    changes,
    nextCursor: changes.at(-1)?.sequence ?? input.cursor,
  };
}

export async function getAccountSnapshot(pool: Pool, accountId: string): Promise<AccountSnapshot> {
  const latest = await currentCursor(pool, accountId);
  const result = await pool.query<{
    account_id: string;
    sequence: string | number;
    entity_type: string;
    entity_id: string;
    operation: AccountChangeOperation;
    payload: unknown | null;
  }>(
    `WITH ranked AS (
       SELECT account_id, sequence, entity_type, entity_id, operation, payload,
              min(sequence) OVER (PARTITION BY entity_type, entity_id) AS first_sequence,
              row_number() OVER (
                PARTITION BY entity_type, entity_id
                ORDER BY sequence DESC
              ) AS row_number
       FROM account_change_log
       WHERE account_id = $1 AND sequence <= $2
     )
     SELECT account_id, sequence, entity_type, entity_id, operation, payload
     FROM ranked
     WHERE row_number = 1
     ORDER BY first_sequence ASC`,
    [accountId, latest],
  );

  return {
    entries: result.rows.map((row) => ({
      accountId: row.account_id,
      sequence: Number(row.sequence),
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: row.payload,
    })),
    nextCursor: latest,
  };
}

import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

export type ProtectedOutboxReference = Readonly<{
  kind: string;
  id: string;
}>;

export type OutboxEventInput = Readonly<{
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  protectedReference?: ProtectedOutboxReference;
  availableAt?: Date;
}>;

export type IdempotentCommandContext = Readonly<{
  client: PoolClient;
  enqueueOutbox(event: OutboxEventInput): Promise<string>;
}>;

export type ExecuteIdempotentCommandOptions<TResult> = Readonly<{
  accountId: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
  work(context: IdempotentCommandContext): Promise<TResult>;
}>;

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export class IncompleteIdempotencyRecordError extends Error {
  constructor() {
    super('Idempotency record has no committed response');
    this.name = 'IncompleteIdempotencyRecordError';
  }
}

interface IdempotencyRow extends QueryResultRow {
  requestHash: string;
  response: unknown;
}

function outboxPayload(event: OutboxEventInput): Record<string, unknown> {
  if (event.protectedReference === undefined) {
    return {};
  }
  return {
    protectedReference: {
      kind: event.protectedReference.kind,
      id: event.protectedReference.id,
    },
  };
}

export async function executeIdempotentCommand<TResult>(
  pool: Pool,
  options: ExecuteIdempotentCommandOptions<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const inserted = await client.query(
        `INSERT INTO idempotency_keys (account_id, key, request_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id, key) DO NOTHING
         RETURNING id`,
        [options.accountId, options.key, options.requestHash, options.expiresAt],
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_hash AS "requestHash", response
           FROM idempotency_keys
           WHERE account_id = $1 AND key = $2
           FOR UPDATE`,
          [options.accountId, options.key],
        );
        const row = existing.rows[0];
        if (row === undefined) {
          throw new IncompleteIdempotencyRecordError();
        }
        if (row.requestHash !== options.requestHash) {
          throw new IdempotencyConflictError();
        }
        if (row.response === null) {
          throw new IncompleteIdempotencyRecordError();
        }
        await client.query('COMMIT');
        return row.response as TResult;
      }

      const context: IdempotentCommandContext = {
        client,
        async enqueueOutbox(event) {
          const id = randomUUID();
          await client.query(
            `INSERT INTO outbox_events (
               id, account_id, event_type, aggregate_type, aggregate_id, payload, available_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              options.accountId,
              event.eventType,
              event.aggregateType,
              event.aggregateId,
              outboxPayload(event),
              event.availableAt ?? new Date(),
            ],
          );
          return id;
        },
      };

      const response = await options.work(context);
      const storedResponse: unknown = response;
      if (storedResponse === null || storedResponse === undefined) {
        throw new TypeError('Idempotent command responses must be non-null JSON values');
      }
      await client.query(
        `UPDATE idempotency_keys
         SET response = $3
         WHERE account_id = $1 AND key = $2`,
        [options.accountId, options.key, response],
      );
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

export type ClaimedOutboxEvent = Readonly<{
  id: string;
  accountId: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attemptCount: number;
  claimToken: string;
}>;

interface ClaimedOutboxRow extends QueryResultRow {
  id: string;
  accountId: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attemptCount: number;
  claimToken: string;
}

export type ClaimOutboxOptions = Readonly<{
  limit: number;
  now?: Date;
  claimTimeoutMs?: number;
  maxAttempts?: number;
}>;

export async function claimOutboxEvents(
  pool: Pool,
  options: ClaimOutboxOptions,
): Promise<ClaimedOutboxEvent[]> {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new RangeError('Outbox claim limit must be a positive integer');
  }
  const now = options.now ?? new Date();
  const claimTimeoutMs = options.claimTimeoutMs ?? 5 * 60_000;
  const maxAttempts = options.maxAttempts ?? 5;
  const staleBefore = new Date(now.getTime() - claimTimeoutMs);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE outbox_events
         SET dead_lettered_at = $1,
             claimed_at = NULL,
             claim_token = NULL,
             last_failure_class = COALESCE(last_failure_class, 'worker_abandoned')
         WHERE processed_at IS NULL
           AND dead_lettered_at IS NULL
           AND attempt_count >= $2
           AND (claimed_at IS NULL OR claimed_at <= $3)`,
        [now, maxAttempts, staleBefore],
      );

      const claimed = await client.query<ClaimedOutboxRow>(
        `WITH candidates AS (
           SELECT id
           FROM outbox_events
           WHERE processed_at IS NULL
             AND dead_lettered_at IS NULL
             AND available_at <= $1
             AND attempt_count < $2
             AND (claimed_at IS NULL OR claimed_at <= $3)
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $4
         )
         UPDATE outbox_events o
         SET claimed_at = $1,
             claim_token = gen_random_uuid(),
             attempt_count = o.attempt_count + 1
         FROM candidates c
         WHERE o.id = c.id
         RETURNING
           o.id,
           o.account_id AS "accountId",
           o.event_type AS "eventType",
           o.aggregate_type AS "aggregateType",
           o.aggregate_id AS "aggregateId",
           o.payload,
           o.attempt_count AS "attemptCount",
           o.claim_token AS "claimToken"`,
        [now, maxAttempts, staleBefore, options.limit],
      );
      await client.query('COMMIT');
      return claimed.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function completeOutboxEvent(
  pool: Pool,
  id: string,
  claimToken: string,
  processedAt = new Date(),
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE outbox_events
     SET processed_at = $3, claimed_at = NULL, claim_token = NULL
     WHERE id = $1
       AND claim_token = $2
       AND processed_at IS NULL
       AND dead_lettered_at IS NULL`,
    [id, claimToken, processedAt],
  );
  return result.rowCount === 1;
}

export type OutboxFailureClass = 'transient' | 'rate_limited' | 'permanent' | 'unknown';
export type OutboxFailureResult = 'retry' | 'dead-letter' | 'stale';

export type FailOutboxOptions = Readonly<{
  id: string;
  claimToken: string;
  failureClass: OutboxFailureClass;
  retryAt: Date;
  maxAttempts?: number;
  failedAt?: Date;
}>;

interface FailureRow extends QueryResultRow {
  deadLetteredAt: Date | null;
}

export async function failOutboxEvent(
  pool: Pool,
  options: FailOutboxOptions,
): Promise<OutboxFailureResult> {
  const maxAttempts = options.maxAttempts ?? 5;
  const failedAt = options.failedAt ?? new Date();
  const result = await pool.query<FailureRow>(
    `UPDATE outbox_events
     SET last_failure_class = $3,
         available_at = $4,
         dead_lettered_at = CASE
           WHEN attempt_count >= $5 OR $3::text = 'permanent' THEN $6::timestamptz
           ELSE NULL::timestamptz
         END,
         claimed_at = NULL,
         claim_token = NULL
     WHERE id = $1
       AND claim_token = $2
       AND processed_at IS NULL
       AND dead_lettered_at IS NULL
     RETURNING dead_lettered_at AS "deadLetteredAt"`,
    [options.id, options.claimToken, options.failureClass, options.retryAt, maxAttempts, failedAt],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return 'stale';
  }
  return row.deadLetteredAt === null ? 'retry' : 'dead-letter';
}

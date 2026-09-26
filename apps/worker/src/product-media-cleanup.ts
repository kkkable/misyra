import type { Pool } from 'pg';

export type ProductMediaCleanupBlobStore = Readonly<{
  delete(container: string, storageKey: string): Promise<void>;
}>;

type ProductMediaCleanupServiceOptions = Readonly<{
  pool: Pool;
  blobStore: ProductMediaCleanupBlobStore;
  now?: () => Date;
  batchSize?: number;
}>;

export type ProductMediaCleanupResult = Readonly<{
  scanned: number;
  deleted: number;
  retryPending: number;
}>;

type ProductMediaPurpose =
  'evidence-working' | 'story-working' | 'planner-working' | 'style-references';

type ProductMediaAsset = Readonly<{
  id: string;
  purpose: string;
  storageKey: string;
  originalStorageKey: string | null;
  thumbnailStorageKey: string | null;
  derivativeStorageKey: string | null;
  temporaryStorageKey: string | null;
  deletionDueAt: Date | null;
  deletionState: string;
}>;

const PRODUCT_MEDIA_PURPOSES = new Set<ProductMediaPurpose>([
  'evidence-working',
  'story-working',
  'planner-working',
  'style-references',
]);
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

function isProductMediaPurpose(purpose: string): purpose is ProductMediaPurpose {
  return PRODUCT_MEDIA_PURPOSES.has(purpose as ProductMediaPurpose);
}

function resolveBatchSize(value: number | undefined) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new TypeError(`batchSize must be an integer between 1 and ${String(MAX_BATCH_SIZE)}`);
  }
  return value;
}

function isEligibleForCleanup(asset: ProductMediaAsset, currentTime: Date) {
  if (!isProductMediaPurpose(asset.purpose)) return false;
  if (asset.deletionState === 'deleting') return true;
  return (
    asset.deletionState === 'active' &&
    asset.deletionDueAt !== null &&
    asset.deletionDueAt.getTime() <= currentTime.getTime()
  );
}

function storageKeys(asset: ProductMediaAsset) {
  return [
    ...new Set(
      [
        asset.storageKey,
        asset.originalStorageKey,
        asset.thumbnailStorageKey,
        asset.derivativeStorageKey,
        asset.temporaryStorageKey,
      ].filter((key): key is string => key !== null),
    ),
  ];
}

export function createProductMediaCleanupService(options: ProductMediaCleanupServiceOptions) {
  const batchSize = resolveBatchSize(options.batchSize);
  const currentTime = options.now ?? (() => new Date());

  return {
    async runOnce(): Promise<ProductMediaCleanupResult> {
      const now = currentTime();
      const candidates = await options.pool.query<{ id: string }>(
        `SELECT id
           FROM media_assets
          WHERE purpose IN (
                  'evidence-working',
                  'story-working',
                  'planner-working',
                  'style-references'
                )
            AND (
              deletion_state = 'deleting'
              OR (deletion_state = 'active' AND deletion_due_at <= $1)
            )
          ORDER BY COALESCE(deletion_due_at, created_at), id
          LIMIT $2`,
        [now, batchSize],
      );

      let scanned = 0;
      let deleted = 0;
      let retryPending = 0;

      for (const candidate of candidates.rows) {
        const client = await options.pool.connect();
        try {
          await client.query('BEGIN');
          const locked = await client.query<ProductMediaAsset>(
            `SELECT
               id,
               purpose,
               storage_key AS "storageKey",
               original_storage_key AS "originalStorageKey",
               thumbnail_storage_key AS "thumbnailStorageKey",
               derivative_storage_key AS "derivativeStorageKey",
               temporary_storage_key AS "temporaryStorageKey",
               deletion_due_at AS "deletionDueAt",
               deletion_state AS "deletionState"
             FROM media_assets
             WHERE id = $1
             FOR UPDATE`,
            [candidate.id],
          );
          const asset = locked.rows[0];
          if (asset === undefined || !isEligibleForCleanup(asset, now)) {
            await client.query('COMMIT');
            continue;
          }

          scanned += 1;
          await client.query(
            `UPDATE media_assets
                SET deletion_state = 'deleting',
                    retry_state = 'ready',
                    deletion_attempt_count = deletion_attempt_count + 1,
                    last_deletion_attempt_at = $2,
                    deleted_at = NULL
              WHERE id = $1`,
            [asset.id, now],
          );

          try {
            for (const key of storageKeys(asset)) {
              await options.blobStore.delete(asset.purpose, key);
            }
          } catch {
            await client.query(
              `UPDATE media_assets
                  SET deletion_state = 'deleting',
                      retry_state = 'retry_pending'
                WHERE id = $1`,
              [asset.id],
            );
            await client.query('COMMIT');
            retryPending += 1;
            continue;
          }

          await client.query(
            `UPDATE media_assets
                SET deletion_state = 'deleted',
                    retry_state = 'ready',
                    deleted_at = $2
              WHERE id = $1`,
            [asset.id, now],
          );
          await client.query('COMMIT');
          deleted += 1;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      await options.pool.query(
        `WITH expired_story_drafts AS (
           DELETE FROM story_drafts
            WHERE created_at <= $1 - INTERVAL '30 days'
            RETURNING account_id, occurrence_id
         )
         UPDATE mission_occurrences occurrence
            SET story_state = 'ready'
           FROM expired_story_drafts expired
          WHERE occurrence.account_id = expired.account_id
            AND occurrence.id = expired.occurrence_id
            AND occurrence.completion_state = 'completed'
            AND occurrence.deletion_state = 'active'`,
        [now],
      );

      return { scanned, deleted, retryPending };
    },
  };
}

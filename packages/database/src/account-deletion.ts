import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

export type AccountDeletionResult = Readonly<{
  deleted: true;
}>;

type CalendarConnectionRow = Readonly<{
  id: string;
}>;

type MediaAssetRow = Readonly<{
  id: string;
  storageKey: string;
}>;

export async function deleteAccountTransaction(
  pool: Pool,
  accountId: string,
): Promise<AccountDeletionResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const connections = await client.query<CalendarConnectionRow>(
      `SELECT id
         FROM external_calendar_connections
        WHERE account_id = $1
        FOR UPDATE`,
      [accountId],
    );
    const media = await client.query<MediaAssetRow>(
      `SELECT id, storage_key AS "storageKey"
         FROM media_assets
        WHERE account_id = $1
        FOR UPDATE`,
      [accountId],
    );

    await client.query('DELETE FROM idempotency_keys WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM outbox_events WHERE account_id = $1', [accountId]);

    await client.query(
      `UPDATE feedback_reports
          SET account_id = NULL
        WHERE account_id = $1`,
      [accountId],
    );

    for (const asset of media.rows) {
      await client.query(
        `INSERT INTO outbox_events
           (id, account_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, NULL, 'account.product_media.delete', 'media_asset', $2, $3)`,
        [
          randomUUID(),
          asset.id,
          {
            protectedReference: {
              kind: 'media_storage_key',
              id: asset.storageKey,
            },
          },
        ],
      );
    }

    for (const connection of connections.rows) {
      await client.query(
        `INSERT INTO outbox_events
           (id, account_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, NULL, 'calendar.connection.disconnect', 'calendar_connection', $2, $3)`,
        [
          randomUUID(),
          connection.id,
          {
            protectedReference: {
              kind: 'calendar_connection',
              id: connection.id,
            },
          },
        ],
      );
    }

    await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

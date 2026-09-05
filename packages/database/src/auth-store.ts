import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

export type DatabaseAuthProvider = 'apple' | 'google';

export type DatabaseAuthAccount = {
  id: string;
  provider: DatabaseAuthProvider;
  subject: string;
};

export type DatabaseAuthCreateSessionInput = {
  id: string;
  accountId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

export type DatabaseAuthRotateSessionInput = {
  presentedHash: string;
  nextHash: string;
  nextExpiresAt: Date;
  now: Date;
};

export type DatabaseAuthRotateSessionResult =
  | { status: 'rotated'; accountId: string; sessionId: string }
  | { status: 'reused' }
  | { status: 'invalid' };

interface AccountRow extends QueryResultRow {
  id: string;
  provider: DatabaseAuthProvider;
  providerSubject: string;
}

interface SessionRow extends QueryResultRow {
  id: string;
  accountId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface RotatedTokenRow extends QueryResultRow {
  familyId: string;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresAuthStore(pool: Pool) {
  return {
    async findOrCreateAccount(
      provider: DatabaseAuthProvider,
      subject: string,
    ): Promise<DatabaseAuthAccount> {
      const result = await pool.query<AccountRow>(
        `INSERT INTO accounts (provider, provider_subject)
         VALUES ($1, $2)
         ON CONFLICT (provider, provider_subject)
         DO UPDATE SET provider_subject = EXCLUDED.provider_subject
         RETURNING id, provider, provider_subject AS "providerSubject"`,
        [provider, subject],
      );
      const row = result.rows[0];
      if (!row) throw new Error('account upsert returned no row');
      return { id: row.id, provider: row.provider, subject: row.providerSubject };
    },

    async consumeProviderNonce(provider: DatabaseAuthProvider, subject: string, nonce: string) {
      const result = await pool.query(
        `INSERT INTO provider_proof_nonces (provider, provider_subject, nonce_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [provider, subject, sha256(nonce)],
      );
      return result.rowCount === 1;
    },

    async createSession(input: DatabaseAuthCreateSessionInput) {
      await pool.query(
        `INSERT INTO account_sessions
           (id, account_id, family_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.id, input.accountId, input.familyId, input.refreshTokenHash, input.expiresAt],
      );
    },

    async rotateSession(
      input: DatabaseAuthRotateSessionInput,
    ): Promise<DatabaseAuthRotateSessionResult> {
      return transaction(pool, async (client) => {
        const current = await client.query<SessionRow>(
          `SELECT id,
                  account_id AS "accountId",
                  family_id AS "familyId",
                  refresh_token_hash AS "refreshTokenHash",
                  expires_at AS "expiresAt",
                  revoked_at AS "revokedAt"
             FROM account_sessions
            WHERE refresh_token_hash = $1
            FOR UPDATE`,
          [input.presentedHash],
        );
        const session = current.rows[0];

        if (session) {
          if (session.revokedAt || session.expiresAt <= input.now) return { status: 'invalid' };

          await client.query(
            `INSERT INTO account_session_rotated_tokens
               (refresh_token_hash, session_id, family_id, rotated_at)
             VALUES ($1, $2, $3, $4)`,
            [session.refreshTokenHash, session.id, session.familyId, input.now],
          );
          await client.query(
            `UPDATE account_sessions
                SET refresh_token_hash = $1,
                    expires_at = $2
              WHERE id = $3`,
            [input.nextHash, input.nextExpiresAt, session.id],
          );
          return { status: 'rotated', accountId: session.accountId, sessionId: session.id };
        }

        const rotated = await client.query<RotatedTokenRow>(
          `SELECT family_id AS "familyId"
             FROM account_session_rotated_tokens
            WHERE refresh_token_hash = $1
            FOR UPDATE`,
          [input.presentedHash],
        );
        const reused = rotated.rows[0];
        if (!reused) return { status: 'invalid' };

        await client.query(
          `UPDATE account_sessions
              SET revoked_at = COALESCE(revoked_at, $1)
            WHERE family_id = $2`,
          [input.now, reused.familyId],
        );
        return { status: 'reused' };
      });
    },
  };
}

import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts034_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
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

describe('MTS-034 PostgreSQL auth store', () => {
  it('uses provider subject as the immutable account key and consumes nonces once', async () => {
    const store = createPostgresAuthStore(pool);
    const subject = `subject-${randomUUID()}`;
    const first = await store.findOrCreateAccount('google', subject);
    const replay = await store.findOrCreateAccount('google', subject);
    const other = await store.findOrCreateAccount('google', `${subject}-other`);

    expect(replay.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    await expect(store.consumeProviderNonce('google', subject, 'nonce-secret')).resolves.toBe(true);
    await expect(store.consumeProviderNonce('google', subject, 'nonce-secret')).resolves.toBe(false);

    const nonceRows = await pool.query<{ nonceHash: string }>(
      `SELECT nonce_hash AS "nonceHash"
         FROM provider_proof_nonces
        WHERE provider = 'google' AND provider_subject = $1`,
      [subject],
    );
    expect(nonceRows.rows[0]?.nonceHash).toBe(hash('nonce-secret'));
    expect(JSON.stringify(nonceRows.rows)).not.toContain('nonce-secret');
  });

  it('atomically rotates refresh hashes and revokes the family on concurrent reuse', async () => {
    const store = createPostgresAuthStore(pool);
    const account = await store.findOrCreateAccount('apple', `subject-${randomUUID()}`);
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const original = 'refresh-original-secret';
    const originalHash = hash(original);
    const now = new Date('2026-09-05T03:05:00.000Z');

    await store.createSession({
      id: sessionId,
      accountId: account.id,
      familyId,
      refreshTokenHash: originalHash,
      expiresAt: new Date('2026-10-05T03:05:00.000Z'),
    });

    const outcomes = await Promise.all([
      store.rotateSession({
        presentedHash: originalHash,
        nextHash: hash('refresh-next-a'),
        nextExpiresAt: new Date('2026-10-05T03:06:00.000Z'),
        now,
      }),
      store.rotateSession({
        presentedHash: originalHash,
        nextHash: hash('refresh-next-b'),
        nextExpiresAt: new Date('2026-10-05T03:06:00.000Z'),
        now,
      }),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['reused', 'rotated']);
    const session = await pool.query<{ revokedAt: Date | null; refreshTokenHash: string }>(
      `SELECT revoked_at AS "revokedAt", refresh_token_hash AS "refreshTokenHash"
         FROM account_sessions
        WHERE id = $1`,
      [sessionId],
    );
    expect(session.rows[0]?.revokedAt).toBeInstanceOf(Date);
    expect(session.rows[0]?.refreshTokenHash).not.toBe(originalHash);

    const history = await pool.query<{ refreshTokenHash: string }>(
      `SELECT refresh_token_hash AS "refreshTokenHash"
         FROM account_session_rotated_tokens
        WHERE family_id = $1`,
      [familyId],
    );
    expect(history.rows).toEqual([{ refreshTokenHash: originalHash }]);
    expect(JSON.stringify([...session.rows, ...history.rows])).not.toContain(original);
  });

  it('detects reuse of any older rotated token, not only the immediately previous token', async () => {
    const store = createPostgresAuthStore(pool);
    const account = await store.findOrCreateAccount('google', `subject-${randomUUID()}`);
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const hashes = ['old-1', 'old-2', 'current'].map(hash);
    const now = new Date('2026-09-05T03:05:00.000Z');

    await store.createSession({
      id: sessionId,
      accountId: account.id,
      familyId,
      refreshTokenHash: hashes[0]!,
      expiresAt: new Date('2026-10-05T03:05:00.000Z'),
    });
    await store.rotateSession({
      presentedHash: hashes[0]!,
      nextHash: hashes[1]!,
      nextExpiresAt: new Date('2026-10-05T03:06:00.000Z'),
      now,
    });
    await store.rotateSession({
      presentedHash: hashes[1]!,
      nextHash: hashes[2]!,
      nextExpiresAt: new Date('2026-10-05T03:07:00.000Z'),
      now,
    });

    await expect(
      store.rotateSession({
        presentedHash: hashes[0]!,
        nextHash: hash('unused'),
        nextExpiresAt: new Date('2026-10-05T03:08:00.000Z'),
        now,
      }),
    ).resolves.toEqual({ status: 'reused' });

    const session = await pool.query<{ revokedAt: Date | null }>(
      `SELECT revoked_at AS "revokedAt" FROM account_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(session.rows[0]?.revokedAt).toBeInstanceOf(Date);
  });
});

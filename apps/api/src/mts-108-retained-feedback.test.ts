import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

import { deleteAccountTransaction } from '@misyra/database';

import { createApiServer } from './index.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts108_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;
const retainedFeedbackModule = './retained-feedback.js';
const retainedFeedbackRoutesModule = './retained-feedback-routes.js';

describe('MTS-108 retained feedback storage and unlinking', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { applyMigrations } = await import('@misyra/database');
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

  it('retains submitted content and screenshot without an expiry, then unlinks account deletion', async () => {
    const accountId = randomUUID();
    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject)
       VALUES ($1, 'google', $2)`,
      [accountId, `subject-${accountId}`],
    );

    const screenshotBytes = Buffer.from('sanitized feedback png');
    const put = vi.fn(() => Promise.resolve());
    const get = vi.fn(() => Promise.resolve(screenshotBytes));
    const remove = vi.fn(() => Promise.resolve());
    const module = (await import(retainedFeedbackModule)) as {
      createRetainedFeedbackService(options: unknown): {
        submit(accountId: string, input: unknown): Promise<{ feedbackId: string }>;
      };
      retainedFeedbackUsePolicy: Readonly<{
        marketing: boolean;
        aiTraining: boolean;
      }>;
    };
    const service = module.createRetainedFeedbackService({
      pool,
      blobStore: { put, get, delete: remove },
      now: () => new Date('2026-09-28T11:00:00.000Z'),
      generateId: randomUUID,
    });

    const result = await service.submit(accountId, {
      category: 'problem',
      description: 'The Calendar stopped refreshing.',
      email: 'deliberate@example.test',
      technicalDetails: {
        appVersion: '1.2.3',
        screenName: 'feedback',
        networkState: 'offline',
      },
      screenshot: {
        bytes: screenshotBytes,
        mimeType: 'image/png',
        sizeBytes: screenshotBytes.length,
      },
    });

    expect(module.retainedFeedbackUsePolicy).toEqual({
      marketing: false,
      aiTraining: false,
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'feedback-retained',
      expect.stringMatching(new RegExp(`^${result.feedbackId}/[0-9a-f-]+\\.png$`, 'i')),
      screenshotBytes,
      'image/png',
    );

    const stored = await pool.query<{
      accountId: string | null;
      category: string;
      email: string | null;
      description: string;
      technicalDetails: unknown;
      marketingUseAllowed: boolean;
      aiTrainingUseAllowed: boolean;
      submittedAt: Date;
      storageKey: string | null;
    }>(
      `SELECT f.account_id AS "accountId",
              f.category,
              f.email,
              f.description,
              f.technical_details AS "technicalDetails",
              f.marketing_use_allowed AS "marketingUseAllowed",
              f.ai_training_use_allowed AS "aiTrainingUseAllowed",
              f.submitted_at AS "submittedAt",
              m.storage_key AS "storageKey"
         FROM feedback_reports f
         LEFT JOIN feedback_media_assets m ON m.feedback_report_id = f.id
        WHERE f.id = $1`,
      [result.feedbackId],
    );

    expect(stored.rows[0]).toMatchObject({
      accountId,
      category: 'problem',
      email: 'deliberate@example.test',
      description: 'The Calendar stopped refreshing.',
      technicalDetails: {
        appVersion: '1.2.3',
        screenName: 'feedback',
        networkState: 'offline',
      },
      marketingUseAllowed: false,
      aiTrainingUseAllowed: false,
      submittedAt: new Date('2026-09-28T11:00:00.000Z'),
    });
    expect(stored.rows[0]?.storageKey).toMatch(
      new RegExp(`^${result.feedbackId}/[0-9a-f-]+\\.png$`, 'i'),
    );

    const productMedia = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM media_assets
        WHERE account_id = $1
          AND purpose = 'feedback-retained'`,
      [accountId],
    );
    expect(productMedia.rows[0]?.count).toBe('0');

    await deleteAccountTransaction(pool, accountId);

    const unlinked = await pool.query<{
      accountId: string | null;
      email: string | null;
      mediaCount: string;
    }>(
      `SELECT f.account_id AS "accountId",
              f.email,
              count(m.id)::text AS "mediaCount"
         FROM feedback_reports f
         LEFT JOIN feedback_media_assets m ON m.feedback_report_id = f.id
        WHERE f.id = $1
        GROUP BY f.id`,
      [result.feedbackId],
    );
    expect(unlinked.rows[0]).toEqual({
      accountId: null,
      email: 'deliberate@example.test',
      mediaCount: '1',
    });
    expect(remove).not.toHaveBeenCalled();

    await pool.query('DELETE FROM feedback_reports WHERE id = $1', [result.feedbackId]);
  });

  it(
    'accepts the existing authenticated multipart feedback protocol without exposing a user history endpoint',
    async () => {
      const accountId = randomUUID();
      const feedbackId = randomUUID();
      const screenshotBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const boundary = 'misyra-mts108-boundary';
      const payload = JSON.stringify({
        category: 'feedback',
        description: 'Calendar feedback',
        email: null,
        technicalDetails: { appVersion: '1.2.3', screenName: 'feedback' },
        screenshot: { mimeType: 'image/png', sizeBytes: screenshotBytes.length },
      });
      const multipartBody = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${payload}\r\n`,
        ),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="feedback.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        screenshotBytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const submit = vi.fn(() => Promise.resolve({ feedbackId }));
      const routesModule = (await import(retainedFeedbackRoutesModule)) as {
        createRetainedFeedbackRoutes(service: unknown): unknown[];
      };
      const server = createApiServer({
        authenticate: () => ({ accountId }),
        routes: routesModule.createRetainedFeedbackRoutes({ submit }) as never[],
      });
  
      const response = await server.inject({
        method: 'POST',
        url: '/v1/feedback',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: multipartBody,
      });
  
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, payload: { feedbackId } });
      expect(submit).toHaveBeenCalledWith(accountId, {
        category: 'feedback',
        description: 'Calendar feedback',
        email: null,
        technicalDetails: { appVersion: '1.2.3', screenName: 'feedback' },
        screenshot: {
          bytes: screenshotBytes,
          mimeType: 'image/png',
          sizeBytes: screenshotBytes.length,
        },
      });
  
      const historyResponse = await server.inject({
        method: 'GET',
        url: '/v1/feedback',
        headers: { authorization: 'Bearer unused-by-test-authenticator' },
      });
      expect(historyResponse.statusCode).toBe(404);
        await server.close();
      },
  );
});

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

import { deleteAccountTransaction } from '@misyra/database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const retainedFeedbackModule = './retained-feedback.js';

describeWithDatabase('MTS-108 retained feedback storage and unlinking', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    const { applyMigrations } = await import('@misyra/database');
    if (databaseUrl !== undefined) await applyMigrations(databaseUrl);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('retains submitted content and screenshot without an expiry, then unlinks account deletion', async () => {
    const accountId = randomUUID();
    await pool.query(
      `INSERT INTO accounts (id, provider, provider_subject)
       VALUES ($1, 'google', $2)`,
      [accountId, `subject-${accountId}`],
    );

    const screenshotBytes = Buffer.from('sanitized feedback png');
    const put = vi.fn(async () => undefined);
    const get = vi.fn(async () => screenshotBytes);
    const remove = vi.fn(async () => undefined);
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
      storageKey: expect.any(String),
    });

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
});

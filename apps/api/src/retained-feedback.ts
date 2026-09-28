import type { Pool } from 'pg';

import type { ProtectedMediaBlobStore } from './protected-media.js';

export const retainedFeedbackUsePolicy = Object.freeze({
  marketing: false,
  aiTraining: false,
});

export type RetainedFeedbackCategory = 'feedback' | 'problem';

export type RetainedFeedbackScreenshot = Readonly<{
  bytes: Buffer;
  mimeType: 'image/png';
  sizeBytes: number;
}>;

export type RetainedFeedbackSubmission = Readonly<{
  category: RetainedFeedbackCategory;
  description: string;
  email: string | null;
  technicalDetails: Readonly<Record<string, unknown>>;
  screenshot: RetainedFeedbackScreenshot | null;
}>;

export type RetainedFeedbackService = Readonly<{
  submit(accountId: string, input: unknown): Promise<{ feedbackId: string }>;
}>;

type RetainedFeedbackServiceOptions = Readonly<{
  pool: Pool;
  blobStore: Pick<ProtectedMediaBlobStore, 'put' | 'delete'>;
  now?: () => Date;
  generateId?: () => string;
}>;

const STRING_DETAIL_KEYS = [
  'appVersion',
  'buildVersion',
  'deviceModel',
  'osVersion',
  'screenName',
  'networkState',
  'submissionTimestamp',
] as const;
const STRING_LIST_DETAIL_KEYS = ['errorCodes', 'crashIdentifiers'] as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredCategory(value: unknown): RetainedFeedbackCategory {
  if (value !== 'feedback' && value !== 'problem') {
    throw new RangeError('feedback_category_invalid');
  }
  return value;
}

function requiredDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError('feedback_description_required');
  }
  return value.trim();
}

function optionalEmail(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new RangeError('feedback_email_invalid');
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function sanitizedTechnicalDetails(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return Object.freeze({});
  const result: Record<string, unknown> = {};

  for (const key of STRING_DETAIL_KEYS) {
    const item = value[key];
    if (typeof item === 'string' && item.trim().length > 0) {
      result[key] = item.trim();
    }
  }
  for (const key of STRING_LIST_DETAIL_KEYS) {
    const item = value[key];
    if (!Array.isArray(item)) continue;
    const values = item
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (values.length > 0) result[key] = values;
  }

  return Object.freeze(result);
}

function optionalScreenshot(value: unknown): RetainedFeedbackScreenshot | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new RangeError('feedback_screenshot_invalid');
  if (
    !Buffer.isBuffer(value.bytes) ||
    value.bytes.length === 0 ||
    value.mimeType !== 'image/png' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes !== value.bytes.length
  ) {
    throw new RangeError('feedback_screenshot_invalid');
  }
  return Object.freeze({
    bytes: value.bytes,
    mimeType: 'image/png',
    sizeBytes: value.sizeBytes,
  });
}

function parseSubmission(value: unknown): RetainedFeedbackSubmission {
  if (!isRecord(value)) throw new RangeError('feedback_payload_invalid');
  return Object.freeze({
    category: requiredCategory(value.category),
    description: requiredDescription(value.description),
    email: optionalEmail(value.email),
    technicalDetails: sanitizedTechnicalDetails(value.technicalDetails),
    screenshot: optionalScreenshot(value.screenshot),
  });
}

export function createRetainedFeedbackService(
  options: RetainedFeedbackServiceOptions,
): RetainedFeedbackService {
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? crypto.randomUUID;

  return Object.freeze({
    async submit(accountId: string, rawInput: unknown) {
      const input = parseSubmission(rawInput);
      const feedbackId = generateId();
      const screenshotId = input.screenshot === null ? null : generateId();
      const storageKey = screenshotId === null ? null : `${feedbackId}/${screenshotId}.png`;
      const submittedAt = now();
      const client = await options.pool.connect();
      let storedBlob = false;

      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO feedback_reports
             (id, account_id, category, email, description, technical_details,
              marketing_use_allowed, ai_training_use_allowed, submitted_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, false, false, $7)`,
          [
            feedbackId,
            accountId,
            input.category,
            input.email,
            input.description,
            JSON.stringify(input.technicalDetails),
            submittedAt,
          ],
        );

        if (input.screenshot !== null && screenshotId !== null && storageKey !== null) {
          await options.blobStore.put(
            'feedback-retained',
            storageKey,
            input.screenshot.bytes,
            input.screenshot.mimeType,
          );
          storedBlob = true;
          await client.query(
            `INSERT INTO feedback_media_assets (id, feedback_report_id, storage_key, created_at)
             VALUES ($1, $2, $3, $4)`,
            [screenshotId, feedbackId, storageKey, submittedAt],
          );
        }

        await client.query('COMMIT');
        return { feedbackId };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (storedBlob && storageKey !== null) {
          await options.blobStore.delete('feedback-retained', storageKey).catch(() => undefined);
        }
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

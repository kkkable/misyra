import { createHash, randomUUID } from 'node:crypto';

import { executeIdempotentCommand } from '@misyra/database';
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
  idempotencyKey: string;
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
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError('feedback_idempotency_key_required');
  }
  return value.trim();
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
    idempotencyKey: requiredIdempotencyKey(value.idempotencyKey),
    category: requiredCategory(value.category),
    description: requiredDescription(value.description),
    email: optionalEmail(value.email),
    technicalDetails: sanitizedTechnicalDetails(value.technicalDetails),
    screenshot: optionalScreenshot(value.screenshot),
  });
}

function technicalDetailsForIdentity(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== 'submissionTimestamp'),
  );
}

function submissionRequestHash(input: RetainedFeedbackSubmission): string {
  const screenshot =
    input.screenshot === null
      ? null
      : {
          mimeType: input.screenshot.mimeType,
          sizeBytes: input.screenshot.sizeBytes,
          sha256: createHash('sha256').update(input.screenshot.bytes).digest('hex'),
        };
  return createHash('sha256')
    .update(
      JSON.stringify({
        category: input.category,
        description: input.description,
        email: input.email,
        technicalDetails: technicalDetailsForIdentity(input.technicalDetails),
        screenshot,
      }),
    )
    .digest('hex');
}

export function createRetainedFeedbackService(
  options: RetainedFeedbackServiceOptions,
): RetainedFeedbackService {
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? randomUUID;

  return Object.freeze({
    async submit(accountId: string, rawInput: unknown) {
      const input = parseSubmission(rawInput);
      const feedbackId = generateId();
      const screenshotId = input.screenshot === null ? null : generateId();
      const storageKey = screenshotId === null ? null : `${feedbackId}/${screenshotId}.png`;
      const submittedAt = now();
      const expiresAt = new Date(submittedAt.getTime() + IDEMPOTENCY_TTL_MS);
      try {
        return await executeIdempotentCommand(options.pool, {
          accountId,
          key: input.idempotencyKey,
          requestHash: submissionRequestHash(input),
          expiresAt,
          async work({ client }) {
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
              await client.query(
                `INSERT INTO feedback_media_assets (id, feedback_report_id, storage_key, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [screenshotId, feedbackId, storageKey, submittedAt],
              );
            }

            return { feedbackId };
          },
        });
      } catch (error) {
        if (storageKey !== null) {
          await options.blobStore.delete('feedback-retained', storageKey).catch(() => undefined);
        }
        throw error;
      }
    },
  });
}

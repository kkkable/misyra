import type { MigrationDatabase } from '../storage/schema.js';
import type { FeedbackFormDraft, FeedbackScreenshot } from './feedback-form.js';
import {
  sanitizeFeedbackTechnicalDetails,
  type FeedbackTechnicalDetails,
} from './feedback-payload.js';

type FeedbackDraftRow = Readonly<{
  category: string;
  description: string;
  email: string;
  technical_details_json: string;
  screenshot_uri: string | null;
  screenshot_mime_type: string | null;
  screenshot_size_bytes: number | null;
  submission_nonce: string | null;
}>;

export type FeedbackPersistedDraft = Readonly<{
  draft: FeedbackFormDraft;
  technicalDetails: FeedbackTechnicalDetails;
}>;

export type FeedbackDraftStore = Readonly<{
  load(): Promise<FeedbackPersistedDraft | null>;
  save(snapshot: FeedbackPersistedDraft): Promise<void>;
  getOrCreateSubmissionKey(generateKey: () => string): Promise<string>;
  discard(): Promise<void>;
  completeSubmission(): Promise<void>;
}>;

function technicalDetailsIdentity(source: FeedbackTechnicalDetails): string {
  const { submissionTimestamp: _submissionTimestamp, ...identity } = source;
  return JSON.stringify(identity);
}

function parseTechnicalDetails(source: string): FeedbackTechnicalDetails {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('feedback_draft_technical_details_invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('feedback_draft_technical_details_invalid');
  }
  return sanitizeFeedbackTechnicalDetails(parsed as Readonly<Record<string, unknown>>);
}

export function createFeedbackDraftStore({
  database,
  accountId,
  removeScreenshot,
  now = () => new Date(),
}: Readonly<{
  database: MigrationDatabase;
  accountId: string;
  removeScreenshot: (uri: string) => Promise<void>;
  now?: () => Date;
}>): FeedbackDraftStore {
  let writeTail = Promise.resolve();

  const load = async (): Promise<FeedbackPersistedDraft | null> => {
    const row = await database.getFirstAsync<FeedbackDraftRow>(
      `SELECT category,
              description,
              email,
              technical_details_json,
              screenshot_uri,
              screenshot_mime_type,
              screenshot_size_bytes,
              submission_nonce
         FROM feedback_drafts
        WHERE account_id = ?`,
      accountId,
    );
    if (row === null) return null;
    if (row.category !== 'feedback' && row.category !== 'problem') {
      throw new Error('feedback_draft_category_invalid');
    }

    let screenshot: FeedbackScreenshot | null = null;
    if (row.screenshot_uri !== null) {
      if (
        row.screenshot_mime_type !== 'image/png' ||
        row.screenshot_size_bytes === null ||
        !Number.isSafeInteger(row.screenshot_size_bytes) ||
        row.screenshot_size_bytes < 0
      ) {
        throw new Error('feedback_draft_screenshot_invalid');
      }
      screenshot = Object.freeze({
        uri: row.screenshot_uri,
        mimeType: 'image/png' as const,
        sizeBytes: row.screenshot_size_bytes,
      });
    }

    return Object.freeze({
      draft: Object.freeze({
        category: row.category,
        description: row.description,
        email: row.email,
        screenshot,
      }),
      technicalDetails: parseTechnicalDetails(row.technical_details_json),
    });
  };

  const save = async (snapshot: FeedbackPersistedDraft): Promise<void> => {
    const operation = writeTail.then(async () => {
      const screenshot = snapshot.draft.screenshot;
      const technicalDetails = sanitizeFeedbackTechnicalDetails(snapshot.technicalDetails);
      const technicalDetailsJson = JSON.stringify(technicalDetails);
      const technicalDetailsIdentityJson = technicalDetailsIdentity(technicalDetails);
      const existing = await database.getFirstAsync<FeedbackDraftRow>(
        `SELECT category,
                description,
                email,
                technical_details_json,
                screenshot_uri,
                screenshot_mime_type,
                screenshot_size_bytes,
                submission_nonce
           FROM feedback_drafts
          WHERE account_id = ?`,
        accountId,
      );
      const sameSubmission =
        existing !== null &&
        existing.category === snapshot.draft.category &&
        existing.description === snapshot.draft.description &&
        existing.email === snapshot.draft.email &&
        technicalDetailsIdentity(parseTechnicalDetails(existing.technical_details_json)) ===
          technicalDetailsIdentityJson &&
        existing.screenshot_uri === (screenshot?.uri ?? null) &&
        existing.screenshot_mime_type === (screenshot?.mimeType ?? null) &&
        existing.screenshot_size_bytes === (screenshot?.sizeBytes ?? null);
      const submissionKey = sameSubmission ? existing.submission_nonce : null;

      await database.runAsync(
        `INSERT INTO feedback_drafts
          (account_id, category, description, email, technical_details_json, screenshot_uri,
           screenshot_mime_type, screenshot_size_bytes, submission_nonce, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           category = excluded.category,
           description = excluded.description,
           email = excluded.email,
           technical_details_json = excluded.technical_details_json,
           screenshot_uri = excluded.screenshot_uri,
           screenshot_mime_type = excluded.screenshot_mime_type,
           screenshot_size_bytes = excluded.screenshot_size_bytes,
           submission_nonce = excluded.submission_nonce,
           updated_at = excluded.updated_at`,
        accountId,
        snapshot.draft.category,
        snapshot.draft.description,
        snapshot.draft.email,
        technicalDetailsJson,
        screenshot?.uri ?? null,
        screenshot?.mimeType ?? null,
        screenshot?.sizeBytes ?? null,
        submissionKey,
        now().toISOString(),
      );
    });
    writeTail = operation.catch(() => undefined);
    await operation;
  };

  const getOrCreateSubmissionKey = async (generateKey: () => string): Promise<string> => {
    await writeTail;
    const current = await database.getFirstAsync<{ submission_nonce: string | null }>(
      'SELECT submission_nonce FROM feedback_drafts WHERE account_id = ?',
      accountId,
    );
    if (current === null) throw new Error('feedback_draft_missing');
    if (current.submission_nonce !== null) return current.submission_nonce;

    const candidate = generateKey().trim();
    if (candidate.length === 0) throw new Error('feedback_submission_nonce_invalid');
    await database.runAsync(
      `UPDATE feedback_drafts
          SET submission_nonce = COALESCE(submission_nonce, ?)
        WHERE account_id = ?`,
      candidate,
      accountId,
    );
    const stored = await database.getFirstAsync<{ submission_nonce: string | null }>(
      'SELECT submission_nonce FROM feedback_drafts WHERE account_id = ?',
      accountId,
    );
    if (stored?.submission_nonce === null || stored?.submission_nonce === undefined) {
      throw new Error('feedback_submission_nonce_missing');
    }
    return stored.submission_nonce;
  };

  const discard = async (): Promise<void> => {
    await writeTail;
    const snapshot = await load();
    if (snapshot?.draft.screenshot !== null && snapshot?.draft.screenshot !== undefined) {
      await removeScreenshot(snapshot.draft.screenshot.uri);
    }
    await database.runAsync('DELETE FROM feedback_drafts WHERE account_id = ?', accountId);
  };

  const completeSubmission = async (): Promise<void> => {
    await writeTail;
    const snapshot = await load();
    await database.runAsync('DELETE FROM feedback_drafts WHERE account_id = ?', accountId);
    if (snapshot?.draft.screenshot !== null && snapshot?.draft.screenshot !== undefined) {
      await removeScreenshot(snapshot.draft.screenshot.uri).catch(() => undefined);
    }
  };

  return Object.freeze({ load, save, getOrCreateSubmissionKey, discard, completeSubmission });
}

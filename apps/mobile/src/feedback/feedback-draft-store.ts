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
}>;

export type FeedbackPersistedDraft = Readonly<{
  draft: FeedbackFormDraft;
  technicalDetails: FeedbackTechnicalDetails;
}>;

export type FeedbackDraftStore = Readonly<{
  load(): Promise<FeedbackPersistedDraft | null>;
  save(snapshot: FeedbackPersistedDraft): Promise<void>;
  discard(): Promise<void>;
}>;

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
              screenshot_size_bytes
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
      const technicalDetails = sanitizeFeedbackTechnicalDetails(
        snapshot.technicalDetails as Readonly<Record<string, unknown>>,
      );
      await database.runAsync(
        `INSERT INTO feedback_drafts
          (account_id, category, description, email, technical_details_json, screenshot_uri,
           screenshot_mime_type, screenshot_size_bytes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           category = excluded.category,
           description = excluded.description,
           email = excluded.email,
           technical_details_json = excluded.technical_details_json,
           screenshot_uri = excluded.screenshot_uri,
           screenshot_mime_type = excluded.screenshot_mime_type,
           screenshot_size_bytes = excluded.screenshot_size_bytes,
           updated_at = excluded.updated_at`,
        accountId,
        snapshot.draft.category,
        snapshot.draft.description,
        snapshot.draft.email,
        JSON.stringify(technicalDetails),
        screenshot?.uri ?? null,
        screenshot?.mimeType ?? null,
        screenshot?.sizeBytes ?? null,
        now().toISOString(),
      );
    });
    writeTail = operation.catch(() => undefined);
    await operation;
  };

  const discard = async (): Promise<void> => {
    await writeTail;
    const snapshot = await load();
    if (snapshot?.draft.screenshot !== null && snapshot?.draft.screenshot !== undefined) {
      await removeScreenshot(snapshot.draft.screenshot.uri);
    }
    await database.runAsync('DELETE FROM feedback_drafts WHERE account_id = ?', accountId);
  };

  return Object.freeze({ load, save, discard });
}

import type { MigrationDatabase } from '../storage/schema.js';
import type { FeedbackFormDraft, FeedbackScreenshot } from './feedback-form.js';

type FeedbackDraftRow = Readonly<{
  category: string;
  description: string;
  email: string;
  screenshot_uri: string | null;
  screenshot_mime_type: string | null;
  screenshot_size_bytes: number | null;
}>;

export type FeedbackDraftStore = Readonly<{
  load(): Promise<FeedbackFormDraft | null>;
  save(draft: FeedbackFormDraft): Promise<void>;
  discard(): Promise<void>;
}>;

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

  const load = async (): Promise<FeedbackFormDraft | null> => {
    const row = await database.getFirstAsync<FeedbackDraftRow>(
      `SELECT category,
              description,
              email,
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
      category: row.category,
      description: row.description,
      email: row.email,
      screenshot,
    });
  };

  const save = async (draft: FeedbackFormDraft): Promise<void> => {
    const operation = writeTail.then(async () => {
      const screenshot = draft.screenshot;
      await database.runAsync(
        `INSERT INTO feedback_drafts
          (account_id, category, description, email, screenshot_uri, screenshot_mime_type,
           screenshot_size_bytes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           category = excluded.category,
           description = excluded.description,
           email = excluded.email,
           screenshot_uri = excluded.screenshot_uri,
           screenshot_mime_type = excluded.screenshot_mime_type,
           screenshot_size_bytes = excluded.screenshot_size_bytes,
           updated_at = excluded.updated_at`,
        accountId,
        draft.category,
        draft.description,
        draft.email,
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
    const draft = await load();
    if (draft?.screenshot !== null && draft?.screenshot !== undefined) {
      await removeScreenshot(draft.screenshot.uri);
    }
    await database.runAsync('DELETE FROM feedback_drafts WHERE account_id = ?', accountId);
  };

  return Object.freeze({ load, save, discard });
}

import { openMobileDatabase } from '../storage/database.js';
import { createFeedbackDraftStore } from './feedback-draft-store.js';
import { removeFeedbackScreenshotFile } from './feedback-screenshot-platform.js';

export async function clearFeedbackDraftForAccount(accountId: string): Promise<void> {
  const database = await openMobileDatabase();
  const store = createFeedbackDraftStore({
    database,
    accountId,
    removeScreenshot: removeFeedbackScreenshotFile,
  });
  await store.discard();
}

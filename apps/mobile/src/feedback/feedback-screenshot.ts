import type { FeedbackScreenshot } from './feedback-form.js';

export type PickedFeedbackScreenshot = Readonly<{
  uri: string;
  mimeType: string | null;
  name?: string | null;
  metadata?: unknown;
}>;

export type FeedbackScreenshotTranscoder = (
  sourceUri: string,
) => Promise<FeedbackScreenshot>;

export async function sanitizeFeedbackScreenshot(
  picked: PickedFeedbackScreenshot,
  transcode: FeedbackScreenshotTranscoder,
): Promise<FeedbackScreenshot> {
  if (picked.uri.trim().length === 0) {
    throw new TypeError('feedback_screenshot_uri_required');
  }

  const sanitized = await transcode(picked.uri);
  if (sanitized.mimeType !== 'image/png' || sanitized.uri.trim().length === 0) {
    throw new Error('feedback_screenshot_transcode_invalid');
  }
  if (!Number.isSafeInteger(sanitized.sizeBytes) || sanitized.sizeBytes < 0) {
    throw new Error('feedback_screenshot_size_invalid');
  }

  return Object.freeze({
    uri: sanitized.uri,
    mimeType: 'image/png',
    sizeBytes: sanitized.sizeBytes,
  });
}

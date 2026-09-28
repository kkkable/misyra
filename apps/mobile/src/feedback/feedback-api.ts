import type { FeedbackSubmissionPayload } from './feedback-payload.js';

type FeedbackApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function feedbackMultipartBody(payload: FeedbackSubmissionPayload, idempotencyKey: string): FormData {
  const form = new FormData();
  const { screenshot, ...rest } = payload;
  form.append(
    'payload',
    JSON.stringify({
      idempotencyKey,
      ...rest,
      screenshot:
        screenshot === null
          ? null
          : {
              mimeType: screenshot.mimeType,
              sizeBytes: screenshot.sizeBytes,
            },
    }),
  );

  if (screenshot !== null) {
    form.append('screenshot', {
      uri: screenshot.uri,
      name: 'feedback.png',
      type: screenshot.mimeType,
    } as unknown as Blob);
  }
  return form;
}

export function createFeedbackApi({ baseUrl, accessToken }: FeedbackApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const authorization = `Bearer ${accessToken}`;

  return Object.freeze({
    async submit(payload: FeedbackSubmissionPayload, idempotencyKey: string): Promise<void> {
      if (idempotencyKey.trim().length === 0) throw new Error('feedback_idempotency_key_required');
      const response = await fetch(`${root}/v1/feedback`, {
        method: 'POST',
        headers: { authorization },
        body: feedbackMultipartBody(payload, idempotencyKey),
      });
      if (!response.ok) throw new Error('feedback_submit_failed');
    },
  });
}

export type FeedbackApi = ReturnType<typeof createFeedbackApi>;

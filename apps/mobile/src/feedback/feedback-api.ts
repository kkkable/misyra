import type { FeedbackSubmissionPayload } from './feedback-payload.js';

type FeedbackApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function feedbackMultipartBody(payload: FeedbackSubmissionPayload): FormData {
  const form = new FormData();
  const { screenshot, ...rest } = payload;
  form.append(
    'payload',
    JSON.stringify({
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
    async submit(payload: FeedbackSubmissionPayload): Promise<void> {
      const response = await fetch(`${root}/v1/feedback`, {
        method: 'POST',
        headers: { authorization },
        body: feedbackMultipartBody(payload),
      });
      if (!response.ok) throw new Error('feedback_submit_failed');
    },
  });
}

export type FeedbackApi = ReturnType<typeof createFeedbackApi>;

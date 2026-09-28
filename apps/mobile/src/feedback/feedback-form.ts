export type FeedbackCategory = 'feedback' | 'problem';

export type FeedbackScreenshot = Readonly<{
  uri: string;
  mimeType: 'image/png';
  sizeBytes: number;
}>;

export type FeedbackFormDraft = Readonly<{
  category: FeedbackCategory;
  description: string;
  email: string;
  screenshot: FeedbackScreenshot | null;
}>;

export function createFeedbackFormDraft(category: FeedbackCategory): FeedbackFormDraft {
  return Object.freeze({
    category,
    description: '',
    email: '',
    screenshot: null,
  });
}

export function updateFeedbackFormDraft(
  draft: FeedbackFormDraft,
  patch: Partial<FeedbackFormDraft>,
): FeedbackFormDraft {
  return Object.freeze({
    ...draft,
    ...patch,
  });
}

export function canSubmitFeedback(draft: FeedbackFormDraft): boolean {
  return draft.description.trim().length > 0;
}

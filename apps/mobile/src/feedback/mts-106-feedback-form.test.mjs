import { describe, expect, it } from 'vitest';

import {
  canSubmitFeedback,
  createFeedbackFormDraft,
  updateFeedbackFormDraft,
} from './feedback-form.js';

describe('MTS-106 feedback form model', () => {
  it.each(['feedback', 'problem'])(
    'starts %s entry with only the approved editable fields and no account email',
    (category) => {
      const draft = createFeedbackFormDraft(category);

      expect(draft).toEqual({
        category,
        description: '',
        email: '',
        screenshot: null,
      });
      expect(draft).not.toHaveProperty('accountEmail');
      expect(draft).not.toHaveProperty('accountId');
      expect(canSubmitFeedback(draft)).toBe(false);
    },
  );

  it('requires a short description while keeping email and screenshot optional', () => {
    const draft = updateFeedbackFormDraft(createFeedbackFormDraft('feedback'), {
      description: 'The Calendar interaction is useful.',
    });

    expect(canSubmitFeedback(draft)).toBe(true);
    expect(draft.email).toBe('');
    expect(draft.screenshot).toBeNull();
  });

  it('supports category, description, optional email, and optional sanitized screenshot edits', () => {
    const screenshot = {
      uri: 'file:///feedback/sanitized.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    };
    const draft = updateFeedbackFormDraft(createFeedbackFormDraft('feedback'), {
      category: 'problem',
      description: 'The screen did not update.',
      email: 'follow-up@example.com',
      screenshot,
    });

    expect(draft).toEqual({
      category: 'problem',
      description: 'The screen did not update.',
      email: 'follow-up@example.com',
      screenshot,
    });
  });
});

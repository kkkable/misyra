import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const settingsPath = fileURLToPath(new URL('../settings/settings-route.tsx', import.meta.url));
const screenPath = fileURLToPath(new URL('./feedback-form-screen.tsx', import.meta.url));
const routePath = fileURLToPath(new URL('../../app/feedback.tsx', import.meta.url));

describe('MTS-106 user-facing feedback surface', () => {
  it('opens the feedback form from both approved Settings entry points', async () => {
    const source = await readFile(settingsPath, 'utf8');

    expect(source).toContain("pathname: '/feedback'");
    expect(source).toContain("category: 'feedback'");
    expect(source).toContain("category: 'problem'");
  });

  it('renders the complete form, preview, disclosure, submit, and success states', async () => {
    const source = await readFile(screenPath, 'utf8');

    for (const testId of [
      'feedback-category',
      'feedback-description',
      'feedback-email',
      'feedback-screenshot',
      'feedback-preview-action',
      'feedback-preview',
      'feedback-technical-summary',
      'feedback-retention-disclosure',
      'feedback-submit',
      'feedback-success',
    ]) {
      expect(source).toContain(testId);
    }
    expect(source).not.toMatch(/submission history|ticket history|status history/i);
  });

  it('uses only a manual system picker and sanitized screenshot path', async () => {
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain('File.pickFileAsync');
    expect(source).toContain('sanitizeFeedbackScreenshot');
    expect(source).toContain('transcodeFeedbackScreenshotToPng');
    expect(source).not.toMatch(/captureScreen|takeScreenshot|automaticScreenshot/i);
  });
});

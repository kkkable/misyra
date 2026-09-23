import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  StoryTextSuggestionUnsafeClaimError,
  createStoryTextSuggestionService,
} from './story-text-suggestions.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';

function contextRow(completionType = 'verified_on_time') {
  return {
    missionTitle: 'Evening run',
    providerTaskDetails: null,
    localStart: '18:00:00',
    localFinish: '18:45:00',
    timeZone: 'Asia/Hong_Kong',
    timeBehavior: 'local_time',
    personalNote: 'First 5K after work',
    completionType,
    appLanguage: 'zh-HK',
    styleProfile: {
      tone: 'concise',
      textDensity: 'low',
      emoji: 'minimal',
    },
    aiGenerationCount: 2,
  };
}

function safeOutput() {
  return {
    headline: 'Done before dinner',
    supportingText: 'A steady 5K after work.',
    sharingNotes: {
      musicMood: 'upbeat running track',
      mention: null,
      location: 'Hong Kong',
      poll: {
        question: 'Run again tomorrow?',
        options: ['Yes', 'Rest day'],
      },
    },
  };
}

describe('MTS-092 Story text suggestion service', () => {
  it('builds AI context server-side from permitted mission, personal-note, style, language, and completion data without consuming image budget', async () => {
    const query = vi.fn((statement: string) => {
      void statement;
      return Promise.resolve({ rows: [contextRow()] });
    });
    const suggestStoryText = vi.fn(() => Promise.resolve(safeOutput()));
    const service = createStoryTextSuggestionService({
      pool: { query } as unknown as Pool,
      gateway: { suggestStoryText },
    });

    await expect(service.suggest(accountId, occurrenceId)).resolves.toEqual(safeOutput());

    expect(suggestStoryText).toHaveBeenCalledWith({
      missionContext: {
        missionTitle: 'Evening run',
        providerTaskDetails: null,
        scheduleContext: '18:00:00 → 18:45:00 · Asia/Hong_Kong · local_time',
        personalNote: 'First 5K after work',
      },
      completionType: 'verified_on_time',
      appLanguage: 'zh-HK',
      styleProfile: {
        tone: 'concise',
        textDensity: 'low',
        emoji: 'minimal',
      },
      claimPolicy: { mayClaimVerification: true },
    });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).not.toMatch(/UPDATE\s+story_drafts/i);
    expect(sql).not.toMatch(/ai_generation_count\s*=|ai_generation_count\s*\+/i);
  });

  it.each([
    ['AI verified this mission', 'A finished run.', 'self_confirmed'],
    ['完成並已驗證', '今晚完成 5K。', 'self_confirmed'],
    ['Verified by AI', 'Private completion.', 'private'],
    ['Evidence accepted', 'Trust Mode completion.', 'trust_mode'],
    ['AI confirmed this mission', 'Self-confirmed completion.', 'self_confirmed'],
    ['人工智能已確認完成', '私人完成。', 'private'],
  ])(
    'rejects verification claims for completion type %s/%s',
    async (headline, supportingText, completionType) => {
      const query = vi.fn(() => Promise.resolve({ rows: [contextRow(completionType)] }));
      const suggestStoryText = vi.fn(() =>
        Promise.resolve({
          ...safeOutput(),
          headline,
          supportingText,
        }),
      );
      const service = createStoryTextSuggestionService({
        pool: { query } as unknown as Pool,
        gateway: { suggestStoryText },
      });

      await expect(service.suggest(accountId, occurrenceId)).rejects.toBeInstanceOf(
        StoryTextSuggestionUnsafeClaimError,
      );
      expect(suggestStoryText).toHaveBeenCalledWith(
        expect.objectContaining({
          completionType,
          claimPolicy: { mayClaimVerification: false },
        }),
      );
    },
  );
});

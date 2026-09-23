import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  StoryStyleProfileInvalidOutputError,
  StoryStyleProfileReferenceError,
  createStoryStyleProfileService,
} from './story-style-profile.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const referenceIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
] as const;

const abstractProfile = {
  palette: ['#111827', '#F9FAFB'],
  contrast: 'high',
  crop: 'balanced',
  textPosition: 'lower_middle',
  fontCategory: 'sans',
  textDensity: 'sparse',
  emoji: 'none',
  effects: ['grain'],
  tone: 'calm',
} as const;

describe('MTS-093 Story style-profile service', () => {
  it('extracts from exactly the owned active style references and updates only the profile row', async () => {
    const query = vi.fn((sql: string) => {
      if (/FROM media_assets/i.test(sql)) {
        return Promise.resolve({ rows: referenceIds.map((id) => ({ id })) });
      }
      if (/INSERT INTO story_style_profiles/i.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const extractStoryStyleProfile = vi.fn(() => Promise.resolve(abstractProfile));
    const service = createStoryStyleProfileService({
      pool: { query } as unknown as Pool,
      gateway: { extractStoryStyleProfile },
      now: () => new Date('2026-09-23T12:00:00.000Z'),
    });

    await expect(service.rebuild(accountId, { referenceAssetIds: referenceIds })).resolves.toEqual({
      mode: 'custom',
      profile: abstractProfile,
    });

    expect(extractStoryStyleProfile).toHaveBeenCalledWith({
      referenceImages: referenceIds.map((assetId) => ({
        assetId,
        purpose: 'style-references',
        variant: 'original',
      })),
      policy: {
        abstractOnly: true,
        prohibitedExactContent: [
          'templates',
          'usernames',
          'logos',
          'watermarks',
          'faces',
          'captions',
        ],
      },
    });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toMatch(/purpose\s*=\s*'style-references'/i);
    expect(sql).toMatch(/original_storage_key\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/deletion_state\s*=\s*'active'/i);
    expect(sql).toMatch(/INSERT INTO story_style_profiles/i);
    expect(sql).not.toMatch(/story_drafts|story_compositions|story_image_versions/i);
  });

  it('rejects missing or non-owned references before invoking AI', async () => {
    const query = vi.fn(() =>
      Promise.resolve({ rows: referenceIds.slice(0, 2).map((id) => ({ id })) }),
    );
    const extractStoryStyleProfile = vi.fn();
    const service = createStoryStyleProfileService({
      pool: { query } as unknown as Pool,
      gateway: { extractStoryStyleProfile },
    });

    await expect(
      service.rebuild(accountId, { referenceAssetIds: referenceIds }),
    ).rejects.toBeInstanceOf(StoryStyleProfileReferenceError);
    expect(extractStoryStyleProfile).not.toHaveBeenCalled();
  });

  it('fails closed on invalid provider output and does not persist it', async () => {
    const query = vi.fn((sql: string) => {
      if (/FROM media_assets/i.test(sql)) {
        return Promise.resolve({ rows: referenceIds.map((id) => ({ id })) });
      }
      throw new Error('Invalid output must not be persisted');
    });
    const service = createStoryStyleProfileService({
      pool: { query } as unknown as Pool,
      gateway: {
        extractStoryStyleProfile: vi.fn(() =>
          Promise.resolve({ ...abstractProfile, username: '@copied-account' }),
        ),
      },
    });

    await expect(
      service.rebuild(accountId, { referenceAssetIds: referenceIds }),
    ).rejects.toBeInstanceOf(StoryStyleProfileInvalidOutputError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('persists Use default without mutating existing Story drafts', async () => {
    const query = vi.fn(() => Promise.resolve({ rows: [] }));
    const service = createStoryStyleProfileService({
      pool: { query } as unknown as Pool,
    });

    await expect(service.useDefault(accountId)).resolves.toEqual({ mode: 'default' });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toMatch(/INSERT INTO story_style_profiles/i);
    expect(sql).not.toMatch(/story_drafts|story_compositions|story_image_versions/i);
  });
});

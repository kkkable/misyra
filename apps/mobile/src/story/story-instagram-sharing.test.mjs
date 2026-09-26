import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStringAsync: vi.fn(async () => undefined),
  openURL: vi.fn(async () => undefined),
}));

vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }));
vi.mock('react-native', () => ({ Linking: { openURL: mocks.openURL } }));

import { createExpoStoryInstagramPlatform } from './expo-story-instagram-platform.ts';
import {
  createStoryInstagramController,
  formatStorySharingPoll,
} from './story-instagram-sharing.ts';

describe('MTS-098 Story Instagram sharing controller', () => {
  it('copies the exact user-selected Sharing Note value', async () => {
    mocks.setStringAsync.mockClear();
    const controller = createStoryInstagramController(createExpoStoryInstagramPlatform());

    await controller.copy('@misyra');

    expect(mocks.setStringAsync).toHaveBeenCalledWith('@misyra');
  });

  it('formats a poll suggestion as copyable plain text', () => {
    expect(
      formatStorySharingPoll({
        question: 'Run again tomorrow?',
        options: ['Yes', 'Maybe later'],
      }),
    ).toBe('Run again tomorrow? — Yes / Maybe later');
  });

  it('opens Instagram through the app scheme and falls back to the web URL', async () => {
    mocks.openURL.mockReset();
    mocks.openURL.mockRejectedValueOnce(new Error('instagram_not_installed'));
    mocks.openURL.mockResolvedValueOnce(undefined);
    const controller = createStoryInstagramController(createExpoStoryInstagramPlatform());

    await controller.open();

    expect(mocks.openURL).toHaveBeenNthCalledWith(1, 'instagram://app');
    expect(mocks.openURL).toHaveBeenNthCalledWith(2, 'https://www.instagram.com/');
  });
});

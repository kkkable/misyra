import { describe, expect, it, vi } from 'vitest';

import {
  createStoryInstagramController,
  formatStorySharingPoll,
} from './story-instagram-sharing.ts';

describe('MTS-098 Story Instagram sharing controller', () => {
  it('copies the exact user-selected Sharing Note value', async () => {
    const copyText = vi.fn(async () => undefined);
    const openInstagram = vi.fn(async () => undefined);
    const controller = createStoryInstagramController({ copyText, openInstagram });

    await controller.copy('@misyra');

    expect(copyText).toHaveBeenCalledWith('@misyra');
    expect(openInstagram).not.toHaveBeenCalled();
  });

  it('formats a poll suggestion as copyable plain text', () => {
    expect(
      formatStorySharingPoll({
        question: 'Run again tomorrow?',
        options: ['Yes', 'Maybe later'],
      }),
    ).toBe('Run again tomorrow? — Yes / Maybe later');
  });
});

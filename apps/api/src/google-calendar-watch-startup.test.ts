import { afterEach, describe, expect, it, vi } from 'vitest';

import { startGoogleCalendarWatchRenewal } from './application.js';

describe('MTS-071 Google watch renewal startup scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renews immediately on startup and then hourly until stopped', async () => {
    vi.useFakeTimers();
    const renewDueChannels = vi.fn().mockResolvedValue(0);
    const onError = vi.fn();

    const stop = startGoogleCalendarWatchRenewal({ renewDueChannels }, onError);

    expect(renewDueChannels).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(renewDueChannels).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(renewDueChannels).toHaveBeenCalledTimes(2);
  });
});

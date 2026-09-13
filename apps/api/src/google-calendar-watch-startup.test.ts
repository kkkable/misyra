import { afterEach, describe, expect, it, vi } from 'vitest';

import { startGoogleCalendarWatchRenewal } from './application.js';

describe('MTS-071 Google watch renewal startup scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('repairs missing watches and renews existing channels immediately and hourly until stopped', async () => {
    vi.useFakeTimers();
    const repairMissingChannels = vi.fn().mockResolvedValue(0);
    const renewDueChannels = vi.fn().mockResolvedValue(0);
    const onError = vi.fn();
    const service = { repairMissingChannels, renewDueChannels };

    const stop = startGoogleCalendarWatchRenewal(service, onError);

    expect(repairMissingChannels).toHaveBeenCalledTimes(1);
    expect(renewDueChannels).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(repairMissingChannels).toHaveBeenCalledTimes(2);
    expect(renewDueChannels).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(repairMissingChannels).toHaveBeenCalledTimes(2);
    expect(renewDueChannels).toHaveBeenCalledTimes(2);
  });
});

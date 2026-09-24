import { describe, expect, it, vi } from 'vitest';

import { createNetworkAvailabilityChannel } from './network-availability-runtime.js';

describe('MTS-096 authenticated network availability channel', () => {
  it('remembers the latest availability and notifies only active subscribers', () => {
    const channel = createNetworkAvailabilityChannel();
    const listener = vi.fn();

    expect(channel.getCurrent()).toBe('unknown');
    const unsubscribe = channel.subscribe(listener);

    channel.publish('unavailable');
    expect(channel.getCurrent()).toBe('unavailable');
    expect(listener).toHaveBeenLastCalledWith('unavailable');

    channel.publish('available');
    expect(channel.getCurrent()).toBe('available');
    expect(listener).toHaveBeenLastCalledWith('available');

    unsubscribe();
    channel.publish('unavailable');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

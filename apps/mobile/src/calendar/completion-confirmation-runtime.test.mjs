import { describe, expect, it, vi } from 'vitest';

import {
  createCompletionConfirmationChannel,
  createCompletionConfirmationRequestChannel,
} from './completion-confirmation-runtime.js';

const event = Object.freeze({
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  awardedXp: 86,
  totalXp: 186,
});
const request = Object.freeze({ occurrenceId: event.occurrenceId });

describe('MTS-061 foreground completion confirmation runtime', () => {
  it('delivers an explicit foreground completion to active Calendar listeners', () => {
    const channel = createCompletionConfirmationChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);

    channel.publish(event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
    unsubscribe();
  });

  it('does not retain or replay completion confirmation events', () => {
    const channel = createCompletionConfirmationChannel();

    channel.publish(event);
    const lateListener = vi.fn();
    channel.subscribe(lateListener);

    expect(lateListener).not.toHaveBeenCalled();
  });

  it('stops delivery after Calendar unsubscribes', () => {
    const channel = createCompletionConfirmationChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    unsubscribe();

    channel.publish(event);

    expect(listener).not.toHaveBeenCalled();
  });

  it('delivers only explicit foreground requests and never replays an earlier request', () => {
    const channel = createCompletionConfirmationRequestChannel();
    const activeListener = vi.fn();
    const unsubscribe = channel.subscribe(activeListener);

    channel.publish(request);
    expect(activeListener).toHaveBeenCalledTimes(1);
    expect(activeListener).toHaveBeenCalledWith(request);
    unsubscribe();

    const lateListener = vi.fn();
    channel.subscribe(lateListener);
    expect(lateListener).not.toHaveBeenCalled();
  });
});

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  return {
    Pressable: ({ children, ...props }) => h('Pressable', props, children),
    StyleSheet: { create: (styles) => styles },
    Text: ({ children, ...props }) => h('Text', props, children),
    View: ({ children, ...props }) => h('View', props, children),
  };
});

import { resolveEvidenceResultFlow } from './evidence-result-flow.js';
import { EvidenceResultPanel } from './evidence-result-panel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const messages = {
  waiting: 'Waiting for verification',
  accepted: 'Evidence accepted',
  rejected: 'Evidence not accepted',
  expired: 'Completion window expired',
  tryAnotherPhoto: 'Try another photo',
  selfConfirm: 'I completed this mission',
  selfConfirmPrompt: 'Mark completed?',
  confirmSelfCompletion: 'Mark completed',
  cancel: 'Cancel',
  reasonTaskMismatch: 'The photo does not match this mission.',
  reasonTaskNotEvident: 'The mission is not clear in the photo.',
  reasonImageUnusable: 'The photo could not be checked.',
};

function renderRejected(attemptNumber = 1, expired = false) {
  const onRetry = vi.fn();
  const onSelfConfirm = vi.fn();
  const flow = resolveEvidenceResultFlow({
    verificationStatus: 'rejected',
    attemptNumber,
    expired,
    reasonCode: 'task_mismatch',
  });
  let renderer;
  act(() => {
    renderer = create(
      createElement(EvidenceResultPanel, {
        flow,
        messages,
        onRetry,
        onSelfConfirm,
      }),
    );
  });
  return { renderer, onRetry, onSelfConfirm };
}

describe('MTS-082 evidence result actions', () => {
  it('requires a second explicit confirmation before self-confirming a rejected attempt', () => {
    const { renderer, onSelfConfirm } = renderRejected();

    expect(renderer.root.findByProps({ testID: 'evidence-result-self-confirm' })).toBeDefined();
    expect(onSelfConfirm).not.toHaveBeenCalled();

    act(() => {
      renderer.root.findByProps({ testID: 'evidence-result-self-confirm' }).props.onPress();
    });

    expect(onSelfConfirm).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'evidence-result-self-confirm-prompt' })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ testID: 'evidence-result-self-confirm-confirm' }).props.onPress();
    });

    expect(onSelfConfirm).toHaveBeenCalledTimes(1);
  });

  it('offers retry only while submitted attempts remain', () => {
    const first = renderRejected(1);
    act(() => {
      first.renderer.root.findByProps({ testID: 'evidence-result-retry' }).props.onPress();
    });
    expect(first.onRetry).toHaveBeenCalledTimes(1);

    const final = renderRejected(3);
    expect(final.renderer.root.findAllByProps({ testID: 'evidence-result-retry' })).toHaveLength(0);
    expect(
      final.renderer.root.findAllByProps({ testID: 'evidence-result-self-confirm' }),
    ).toHaveLength(1);
  });

  it('exposes no retry or self-confirm action after expiry', () => {
    const { renderer } = renderRejected(1, true);

    expect(renderer.root.findAllByProps({ testID: 'evidence-result-retry' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'evidence-result-self-confirm' })).toHaveLength(0);
  });
});

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerBack = vi.hoisted(() => vi.fn());
const publishCompletionRequest = vi.hoisted(() => vi.fn());

vi.mock('expo-router', () => ({
  router: { back: routerBack },
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('./completion-confirmation-runtime.js', () => ({
  completionConfirmationRequestChannel: { publish: publishCompletionRequest },
}));

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    Pressable,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
});

import {
  PrivateTrustCompletionPanel,
  resolveNoEvidenceCompletionMode,
} from './private-trust-completion.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  routerBack.mockReset();
  publishCompletionRequest.mockReset();
});

describe('MTS-059 no-evidence completion mode matrix', () => {
  it.each([
    ['future normal mission', 'future', 'incomplete', 'not_submitted', false, null],
    ['normal mission before evidence', 'active', 'incomplete', 'not_submitted', false, 'private'],
    ['mission already marked Private', 'active', 'incomplete', 'not_required', false, 'private'],
    ['Private locked after rejected evidence', 'active', 'incomplete', 'rejected', false, null],
    ['Trust Mode on new mission', 'active', 'incomplete', 'not_submitted', true, 'trust'],
    ['Trust Mode after rejected evidence', 'active', 'incomplete', 'rejected', true, 'trust'],
    [
      'Trust Mode does not interrupt active evidence',
      'active',
      'incomplete',
      'pending',
      true,
      null,
    ],
    ['completed mission never changes', 'completed', 'completed', 'not_required', true, null],
    ['expired mission cannot complete', 'expired', 'incomplete', 'not_submitted', true, null],
    ['cancelled mission cannot complete', 'cancelled', 'incomplete', 'not_submitted', true, null],
  ])('%s', (_label, lifecycle, completionState, evidenceState, trustMode, expected) => {
    expect(
      resolveNoEvidenceCompletionMode({
        lifecycle,
        completionState,
        evidenceState,
        trustMode,
      }),
    ).toBe(expected);
  });
});

describe('MTS-059 completion confirmation', () => {
  it('requires explicit confirmation before Private completion', () => {
    const onConfirm = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(PrivateTrustCompletionPanel, {
          colorScheme: 'light',
          language: 'en',
          mode: 'private',
          onConfirm,
        }),
      );
    });

    expect(onConfirm).not.toHaveBeenCalled();
    act(() =>
      renderer.root.findByProps({ testID: 'private-trust-completion-action' }).props.onPress(),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByProps({ testID: 'private-trust-completion-confirm' }).length,
    ).toBeGreaterThan(0);

    act(() =>
      renderer.root.findByProps({ testID: 'private-trust-completion-confirm' }).props.onPress(),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('private');
  });

  it('renders Trust Mode as a global completion path, never a per-mission toggle', () => {
    const onConfirm = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(PrivateTrustCompletionPanel, {
          colorScheme: 'dark',
          language: 'zh-HK',
          mode: 'trust',
          onConfirm,
        }),
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'private-trust-mode-toggle' })).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: 'private-trust-completion-action' }).length,
    ).toBeGreaterThan(0);
  });

  it('leaves Calendar navigation and completion signaling to the owning route', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    let renderer;
    act(() => {
      renderer = create(
        createElement(PrivateTrustCompletionPanel, {
          colorScheme: 'light',
          language: 'en',
          mode: 'private',
          onConfirm,
        }),
      );
    });

    act(() =>
      renderer.root.findByProps({ testID: 'private-trust-completion-action' }).props.onPress(),
    );
    await act(async () => {
      renderer.root.findByProps({ testID: 'private-trust-completion-confirm' }).props.onPress();
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('private');
    expect(routerBack).not.toHaveBeenCalled();
    expect(publishCompletionRequest).not.toHaveBeenCalled();
  });
});

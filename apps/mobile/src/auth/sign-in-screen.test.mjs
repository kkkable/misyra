import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { darkColors } from '@misyra/design-tokens';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');

  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );

  return {
    Modal: 'Modal',
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: {
      absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      create: (styles) => styles,
      hairlineWidth: 1,
    },
    Switch: 'Switch',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
  };
});

import { SignInScreen } from './sign-in-screen.js';

const messages = {
  title: 'Sign in to Misyra',
  apple: 'Continue with Apple',
  google: 'Continue with Google',
};

describe('MTS-035 sign-in screen', () => {
  it('offers only Apple and Google account entry with no guest action', () => {
    const onSignIn = vi.fn();
    let renderer;
    act(() => {
      renderer = create(createElement(SignInScreen, { colorScheme: 'light', messages, onSignIn }));
    });

    expect(renderer.root.findByProps({ testID: 'auth-sign-in-screen' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'auth-sign-in-apple' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'auth-sign-in-google' })).toBeTruthy();
    expect(
      renderer.root.findAll((node) => node.props?.testID === 'auth-sign-in-guest'),
    ).toHaveLength(0);

    act(() => renderer.root.findByProps({ testID: 'auth-sign-in-apple' }).props.onPress());
    expect(onSignIn).toHaveBeenCalledWith('apple');
  });

  it('renders localized nontechnical failure copy supplied by the locale boundary', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(SignInScreen, {
          colorScheme: 'dark',
          messages: {
            title: '登入 Misyra',
            apple: '使用 Apple 繼續',
            google: '使用 Google 繼續',
          },
          errorMessage: '登入失敗，請再試一次。',
          onSignIn: vi.fn(),
        }),
      );
    });

    expect(renderer.root.findAllByProps({ children: '登入失敗，請再試一次。' })).not.toHaveLength(
      0,
    );
  });

  it('uses the dark theme foreground for sign-in and provider-error text', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(SignInScreen, {
          colorScheme: 'dark',
          messages,
          errorMessage: 'Sign-in failed. Please try again.',
          onSignIn: vi.fn(),
        }),
      );
    });

    expect(
      renderer.root.findByProps({ children: messages.title }).props.style.color,
    ).toBe(darkColors.textPrimary);
    expect(
      renderer.root.findByProps({ children: 'Sign-in failed. Please try again.' }).props.style.color,
    ).toBe(darkColors.textPrimary);
  });
});

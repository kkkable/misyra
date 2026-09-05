import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { SignInScreen } from './sign-in-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
      renderer = create(
        createElement(SignInScreen, { colorScheme: 'light', messages, onSignIn }),
      );
    });

    expect(renderer.root.findByProps({ testID: 'auth-sign-in-screen' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'auth-sign-in-apple' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'auth-sign-in-google' })).toBeTruthy();
    expect(renderer.root.findAll((node) => node.props?.testID === 'auth-sign-in-guest')).toHaveLength(0);

    act(() => renderer.root.findByProps({ testID: 'auth-sign-in-apple' }).props.onPress());
    expect(onSignIn).toHaveBeenCalledWith('apple');
  });

  it('renders localized nontechnical failure copy supplied by the locale boundary', () => {
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

    expect(renderer.root.findAllByProps({ children: 'Sign-in failed. Please try again.' })).not.toHaveLength(0);
  });
});

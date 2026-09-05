import { useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { AuthProvider, AuthSessionController, AuthState } from './auth-session.js';
import { SignInScreen, type SignInMessages } from './sign-in-screen.js';

export type AuthGateMessages = SignInMessages & {
  readonly signInFailed: string;
};

type AuthGateProps = {
  readonly children: ReactNode;
  readonly controller: AuthSessionController;
  readonly messages: AuthGateMessages;
};

export function AuthGate({ children, controller, messages }: AuthGateProps) {
  const systemColorScheme = useColorScheme();
  const colorScheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [state, setState] = useState<AuthState | null>(null);
  const [busyProvider, setBusyProvider] = useState<AuthProvider | undefined>();

  useEffect(() => {
    let active = true;
    void controller.restore().then((restored) => {
      if (active) setState(restored);
    });
    return () => {
      active = false;
    };
  }, [controller]);

  if (state === null) return null;
  if (state.status === 'signed_in') return children;

  const signIn = (provider: AuthProvider) => {
    setBusyProvider(provider);
    void controller.signIn(provider).then((nextState) => {
      setBusyProvider(undefined);
      setState(nextState);
    });
  };

  return (
    <SignInScreen
      {...(busyProvider === undefined ? {} : { busyProvider })}
      colorScheme={colorScheme}
      {...(state.status === 'error' ? { errorMessage: state.message } : {})}
      messages={messages}
      onSignIn={signIn}
    />
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { OnboardingController, OnboardingState } from './onboarding-flow.js';
import { OnboardingScreen, type OnboardingMessages } from './onboarding-screen.js';

export type OnboardingGateProps = {
  readonly children: ReactNode;
  readonly controller: OnboardingController;
  readonly messages: OnboardingMessages;
};

export function OnboardingGate({ children, controller, messages }: OnboardingGateProps) {
  const systemColorScheme = useColorScheme();
  const colorScheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [state, setState] = useState<OnboardingState | null>(null);

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
  if (state.step === 'complete') return children;

  return (
    <OnboardingScreen
      colorScheme={colorScheme}
      messages={messages}
      onCalendarChoice={(provider) => {
        void controller.chooseCalendarProvider(provider).then(setState);
      }}
      onNotificationChoice={(choice) => {
        void controller.chooseNotifications(choice).then(setState);
      }}
      state={state}
    />
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { CalendarConnectionCatalog } from '@misyra/localization';

import { CalendarConnectionScreen } from './calendar-connection-screen.js';
import type {
  CalendarConnectionFlowController,
  CalendarConnectionFlowState,
} from './calendar-connection-flow.js';
import type { OnboardingController, OnboardingState } from './onboarding-flow.js';
import { OnboardingScreen, type OnboardingMessages } from './onboarding-screen.js';

export type OnboardingGateProps = {
  readonly children: ReactNode;
  readonly calendarConnectionController: CalendarConnectionFlowController;
  readonly calendarConnectionMessages: CalendarConnectionCatalog;
  readonly controller: OnboardingController;
  readonly messages: OnboardingMessages;
};

export function OnboardingGate({
  children,
  calendarConnectionController,
  calendarConnectionMessages,
  controller,
  messages,
}: OnboardingGateProps) {
  const systemColorScheme = useColorScheme();
  const colorScheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [state, setState] = useState<OnboardingState | null>(null);
  const [calendarConnectionState, setCalendarConnectionState] =
    useState<CalendarConnectionFlowState>(() => calendarConnectionController.getState());

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

  if (
    state.step === 'calendar' &&
    calendarConnectionState.step !== 'idle' &&
    calendarConnectionState.step !== 'complete'
  ) {
    return (
      <CalendarConnectionScreen
        colorScheme={colorScheme}
        messages={calendarConnectionMessages}
        onBack={() => {
          setCalendarConnectionState(calendarConnectionController.back());
        }}
        onConfirm={() => {
          if (
            calendarConnectionState.step !== 'confirm_initial' &&
            calendarConnectionState.step !== 'confirm_final'
          ) {
            return;
          }
          const provider = calendarConnectionState.provider;
          void calendarConnectionController.confirm().then(async (nextState) => {
            setCalendarConnectionState(nextState);
            if (nextState.step === 'complete') {
              setState(await controller.chooseCalendarProvider(provider));
            }
          });
        }}
        onDirectionChoice={(direction) => {
          setCalendarConnectionState(calendarConnectionController.chooseDirection(direction));
        }}
        state={calendarConnectionState}
      />
    );
  }

  return (
    <OnboardingScreen
      colorScheme={colorScheme}
      messages={messages}
      onCalendarChoice={(provider) => {
        if (provider === null) {
          void controller.chooseCalendarProvider(null).then(setState);
          return;
        }
        void calendarConnectionController.start(provider).then(setCalendarConnectionState);
      }}
      onNotificationChoice={(choice) => {
        void controller.chooseNotifications(choice).then(setState);
      }}
      state={state}
    />
  );
}

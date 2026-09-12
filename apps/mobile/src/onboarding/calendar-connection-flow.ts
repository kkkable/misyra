import type {
  ExternalCalendarInitialSyncDirection,
  ExternalCalendarProvider,
} from '@misyra/contracts';
import {
  calendarConnectionCatalogs,
  type CalendarConnectionCatalog,
  type CalendarConnectionLocale,
} from '@misyra/localization';

export type CalendarConnectionIntent = Readonly<{
  provider: ExternalCalendarProvider;
  initialSyncDirection: ExternalCalendarInitialSyncDirection;
  initialMigrationWindow: 'future_only';
  pastDataPolicy: 'unchanged';
}>;

export type CalendarConnectionFlowState =
  | Readonly<{ step: 'idle' }>
  | Readonly<{
      step: 'direction';
      provider: ExternalCalendarProvider;
    }>
  | Readonly<{
      step: 'confirm_initial' | 'confirm_final';
      provider: ExternalCalendarProvider;
      initialSyncDirection: ExternalCalendarInitialSyncDirection;
    }>
  | Readonly<{ step: 'blocked'; reason: 'connection_exists' }>
  | Readonly<{ step: 'complete' }>;

export type CalendarConnectionFlowGateway = Readonly<{
  hasActiveConnection(): Promise<boolean>;
  onConfirmed(intent: CalendarConnectionIntent): Promise<void>;
}>;

export type CalendarConnectionFlowController = Readonly<{
  getState(): CalendarConnectionFlowState;
  start(provider: ExternalCalendarProvider): Promise<CalendarConnectionFlowState>;
  chooseDirection(direction: ExternalCalendarInitialSyncDirection): CalendarConnectionFlowState;
  confirm(): Promise<CalendarConnectionFlowState>;
  back(): CalendarConnectionFlowState;
}>;

export function calendarConnectionMessagesForLocale(
  locale: CalendarConnectionLocale,
): CalendarConnectionCatalog {
  return calendarConnectionCatalogs[locale];
}

export function createCalendarConnectionFlowController(input: {
  gateway: CalendarConnectionFlowGateway;
}): CalendarConnectionFlowController {
  let state: CalendarConnectionFlowState = { step: 'idle' };

  const requireConfirmationState = () => {
    if (state.step !== 'confirm_initial' && state.step !== 'confirm_final') {
      throw new Error('Calendar connection cannot be confirmed from the current state.');
    }
    return state;
  };

  return {
    getState() {
      return state;
    },

    async start(provider) {
      if (await input.gateway.hasActiveConnection()) {
        state = { step: 'blocked', reason: 'connection_exists' };
        return state;
      }

      state = { step: 'direction', provider };
      return state;
    },

    chooseDirection(initialSyncDirection) {
      if (state.step !== 'direction') {
        throw new Error('Calendar connection direction cannot be chosen from the current state.');
      }

      state = {
        step: 'confirm_initial',
        provider: state.provider,
        initialSyncDirection,
      };
      return state;
    },

    async confirm() {
      const confirmationState = requireConfirmationState();

      if (confirmationState.step === 'confirm_initial') {
        state = {
          ...confirmationState,
          step: 'confirm_final',
        };
        return state;
      }

      if (await input.gateway.hasActiveConnection()) {
        state = { step: 'blocked', reason: 'connection_exists' };
        return state;
      }

      await input.gateway.onConfirmed({
        provider: confirmationState.provider,
        initialSyncDirection: confirmationState.initialSyncDirection,
        initialMigrationWindow: 'future_only',
        pastDataPolicy: 'unchanged',
      });
      state = { step: 'complete' };
      return state;
    },

    back() {
      if (state.step === 'confirm_final') {
        state = { ...state, step: 'confirm_initial' };
        return state;
      }
      if (state.step === 'confirm_initial') {
        state = { step: 'direction', provider: state.provider };
        return state;
      }
      return state;
    },
  };
}

export type OnboardingLanguage = 'en' | 'zh-HK';
export type OnboardingStep = 'notifications' | 'calendar' | 'complete';
export type CalendarProvider = 'apple' | 'google';
export type PermissionResult = 'granted' | 'denied' | 'unavailable';

export type OnboardingState = {
  readonly language: OnboardingLanguage;
  readonly step: OnboardingStep;
};

export type NotificationChoice = 'enable' | 'not_now';

export type OnboardingStore = {
  load(): Promise<OnboardingState | null>;
  save(state: OnboardingState): Promise<void>;
};

export type OnboardingPermissionGateway = {
  requestNotifications(): Promise<PermissionResult>;
  requestCalendar(provider: CalendarProvider): Promise<PermissionResult>;
};

type CreateOnboardingControllerInput = {
  readonly store: OnboardingStore;
  readonly permissions: OnboardingPermissionGateway;
  readonly resolveLanguage: () => OnboardingLanguage;
  readonly openCalendar: () => void;
};

export type OnboardingController = {
  restore(): Promise<OnboardingState>;
  chooseNotifications(choice: NotificationChoice): Promise<OnboardingState>;
  chooseCalendarProvider(provider: CalendarProvider | null): Promise<OnboardingState>;
};

export function createOnboardingController({
  store,
  permissions,
  resolveLanguage,
  openCalendar,
}: CreateOnboardingControllerInput): OnboardingController {
  let currentState: OnboardingState | null = null;

  async function requireState() {
    return currentState ?? restore();
  }

  async function persist(state: OnboardingState) {
    currentState = state;
    await store.save(state);
    return state;
  }

  async function restore(): Promise<OnboardingState> {
    const saved = await store.load();
    if (saved !== null) {
      currentState = saved;
      if (saved.step === 'complete') openCalendar();
      return saved;
    }

    return persist({ language: resolveLanguage(), step: 'notifications' });
  }

  return {
    restore,

    async chooseNotifications(choice) {
      const state = await requireState();
      if (state.step !== 'notifications') return state;

      if (choice === 'enable') await permissions.requestNotifications();
      return persist({ language: state.language, step: 'calendar' });
    },

    async chooseCalendarProvider(provider) {
      const state = await requireState();
      if (state.step !== 'calendar') return state;

      if (provider !== null) await permissions.requestCalendar(provider);
      const completed = await persist({ language: state.language, step: 'complete' });
      openCalendar();
      return completed;
    },
  };
}

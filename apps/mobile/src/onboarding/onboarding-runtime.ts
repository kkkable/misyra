import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import { localizationCatalogs } from '@misyra/localization';

import { resolveAuthLocale } from '../auth/auth-messages.js';
import {
  createOnboardingController,
  type CalendarProvider,
  type OnboardingPermissionGateway,
  type OnboardingState,
  type PermissionResult,
} from './onboarding-flow.js';
import type { OnboardingMessages } from './onboarding-screen.js';

const ONBOARDING_STATE_KEY = 'misyra.onboarding.v1';

let notificationPermissionRequest: (() => Promise<PermissionResult>) | null = null;
let calendarPermissionRequest: ((provider: CalendarProvider) => Promise<PermissionResult>) | null =
  null;

export function configureOnboardingPermissionGateway(gateway: OnboardingPermissionGateway) {
  notificationPermissionRequest = () => gateway.requestNotifications();
  calendarPermissionRequest = (provider) => gateway.requestCalendar(provider);
}

function isOnboardingState(value: unknown): value is OnboardingState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<OnboardingState>;
  const validLanguage = candidate.language === 'en' || candidate.language === 'zh-HK';
  const validStep =
    candidate.step === 'notifications' ||
    candidate.step === 'calendar' ||
    candidate.step === 'complete';
  return validLanguage && validStep;
}

export const rootOnboardingStore = {
  async load(): Promise<OnboardingState | null> {
    const raw = await SecureStore.getItemAsync(ONBOARDING_STATE_KEY);
    if (raw === null) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      return isOnboardingState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  async save(state: OnboardingState): Promise<void> {
    await SecureStore.setItemAsync(ONBOARDING_STATE_KEY, JSON.stringify(state));
  },
};

const permissions: OnboardingPermissionGateway = {
  async requestNotifications() {
    if (notificationPermissionRequest === null) return 'unavailable';
    return notificationPermissionRequest();
  },
  async requestCalendar(provider) {
    if (calendarPermissionRequest === null) return 'unavailable';
    return calendarPermissionRequest(provider);
  },
};

export const rootOnboardingController = createOnboardingController({
  store: rootOnboardingStore,
  permissions,
  resolveLanguage: () => resolveAuthLocale(getLocales()[0]),
  openCalendar: () => undefined,
});

export function onboardingMessagesForLocale(locale: 'en' | 'zh-HK'): OnboardingMessages {
  const catalog = localizationCatalogs[locale];
  return {
    notificationsTitle: catalog['onboarding.notifications.title'],
    notificationsBody: catalog['onboarding.notifications.body'],
    enableNotifications: catalog['onboarding.notifications.enable'],
    notNow: catalog['onboarding.notifications.notNow'],
    calendarTitle: catalog['onboarding.calendar.title'],
    calendarBody: catalog['onboarding.calendar.body'],
    appleCalendar: catalog['onboarding.calendar.apple'],
    googleCalendar: catalog['onboarding.calendar.google'],
    skipCalendar: catalog['onboarding.calendar.skip'],
  };
}

export const rootOnboardingMessages = onboardingMessagesForLocale(
  resolveAuthLocale(getLocales()[0]),
);

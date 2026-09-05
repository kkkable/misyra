import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import { createAuthExchangeApi } from './auth-api.js';
import { authMessagesForLocale, resolveAuthLocale } from './auth-messages.js';
import {
  createAuthSessionController,
  type AuthExchangeApi,
  type ProviderSignInGateway,
} from './auth-session.js';
import { createSecureSessionStorage } from './secure-session-storage.js';
import { createSignOutCleanup } from './sign-out-cleanup.js';
import { openMobileDatabase } from '../storage/database.js';

let providerGateway: ProviderSignInGateway | null = null;
let apiBaseUrl = 'http://127.0.0.1:3000';

export function configureProviderSignInGateway(gateway: ProviderSignInGateway) {
  providerGateway = gateway;
}

export function configureAuthApiBaseUrl(baseUrl: string) {
  apiBaseUrl = baseUrl;
}

const configuredProviderGateway: ProviderSignInGateway = {
  async signIn(provider) {
    if (providerGateway === null) throw new Error('provider_sign_in_not_configured');
    return providerGateway.signIn(provider);
  },
};

function authApi() {
  return createAuthExchangeApi({ baseUrl: apiBaseUrl });
}

const configuredAuthApi: AuthExchangeApi = {
  exchange(input) {
    return authApi().exchange(input);
  },
  refresh(refreshToken) {
    return authApi().refresh(refreshToken);
  },
  signOut(refreshToken) {
    return authApi().signOut(refreshToken);
  },
};

export const rootAuthMessages = authMessagesForLocale(resolveAuthLocale(getLocales()[0]));

export const rootAuthController = createAuthSessionController({
  storage: createSecureSessionStorage(SecureStore),
  provider: configuredProviderGateway,
  api: configuredAuthApi,
  cleanup: createSignOutCleanup({ openDatabase: openMobileDatabase }),
  messages: { signInFailed: rootAuthMessages.signInFailed },
});

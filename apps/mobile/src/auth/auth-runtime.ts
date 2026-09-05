import * as SecureStore from 'expo-secure-store';

import { createAuthExchangeApi } from './auth-api.js';
import {
  createAuthSessionController,
  type AuthExchangeApi,
  type ProviderSignInGateway,
} from './auth-session.js';
import { createSecureSessionStorage } from './secure-session-storage.js';

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

const configuredAuthApi: AuthExchangeApi = {
  exchange(input) {
    return createAuthExchangeApi({ baseUrl: apiBaseUrl }).exchange(input);
  },
};

export const rootAuthMessages = {
  title: 'Sign in to Misyra',
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  signInFailed: 'Sign-in failed. Please try again.',
} as const;

export const rootAuthController = createAuthSessionController({
  storage: createSecureSessionStorage(SecureStore),
  provider: configuredProviderGateway,
  api: configuredAuthApi,
  messages: { signInFailed: rootAuthMessages.signInFailed },
});

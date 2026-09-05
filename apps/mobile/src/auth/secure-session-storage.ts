import { isAuthSession, type AuthSessionStorage } from './auth-session.js';

export type SecureStoreDriver = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const SESSION_KEY = 'misyra.auth.session.v1';

export function createSecureSessionStorage(secureStore: SecureStoreDriver): AuthSessionStorage {
  return {
    async read() {
      const encoded = await secureStore.getItemAsync(SESSION_KEY);
      if (encoded === null) return null;
      try {
        const parsed: unknown = JSON.parse(encoded);
        return isAuthSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },

    async write(session) {
      await secureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    },

    async clear() {
      await secureStore.deleteItemAsync(SESSION_KEY);
    },
  };
}

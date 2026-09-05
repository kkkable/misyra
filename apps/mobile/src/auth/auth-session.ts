import {
  authTokenPairSchema,
  type AuthProvider as SharedAuthProvider,
  type AuthTokenPair,
} from '@misyra/contracts/v1/auth';

export type AuthProvider = SharedAuthProvider;
export type AuthSession = AuthTokenPair;

export type ProviderProof = {
  readonly provider: AuthProvider;
  readonly proof: string;
  readonly nonce: string;
};

export type AuthSessionStorage = {
  read(): Promise<AuthSession | null>;
  write(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
};

export type ProviderSignInGateway = {
  signIn(provider: AuthProvider): Promise<ProviderProof | null>;
};

export type AuthExchangeApi = {
  exchange(input: ProviderProof): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  signOut(refreshToken: string): Promise<void>;
};

export type AuthState =
  | { readonly status: 'signed_out' }
  | { readonly status: 'signed_in'; readonly session: AuthSession }
  | { readonly status: 'error'; readonly message: string };

export type AuthSessionController = {
  restore(): Promise<AuthState>;
  signIn(provider: AuthProvider): Promise<AuthState>;
  signOut(): Promise<AuthState>;
};

type AuthSessionControllerOptions = {
  readonly storage: AuthSessionStorage;
  readonly provider: ProviderSignInGateway;
  readonly api: AuthExchangeApi;
  readonly cleanup?: (accountId: string) => Promise<void>;
  readonly now?: () => Date;
  readonly messages: {
    readonly signInFailed: string;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isAuthSession(value: unknown): value is AuthSession {
  return authTokenPairSchema.safeParse(value).success;
}

function isAccessTokenValid(session: AuthSession, now: Date) {
  return Date.parse(session.accessTokenExpiresAt) > now.getTime();
}

function isRefreshTokenValid(session: AuthSession, now: Date) {
  return Date.parse(session.refreshTokenExpiresAt) > now.getTime();
}

export function createAuthSessionController({
  storage,
  provider,
  api,
  cleanup = () => Promise.resolve(),
  now = () => new Date(),
  messages,
}: AuthSessionControllerOptions): AuthSessionController {
  let activeSession: AuthSession | null = null;
  let refreshInFlight: Promise<AuthState> | null = null;

  async function refreshStoredSession(stored: AuthSession): Promise<AuthState> {
    if (refreshInFlight !== null) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const refreshed = await api.refresh(stored.refreshToken);
        if (!isAuthSession(refreshed) || refreshed.accountId !== stored.accountId) {
          await storage.clear();
          activeSession = null;
          return { status: 'signed_out' } as const;
        }
        await storage.write(refreshed);
        activeSession = refreshed;
        return { status: 'signed_in', session: refreshed } as const;
      } catch {
        await storage.clear();
        activeSession = null;
        return { status: 'signed_out' } as const;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  return {
    async restore() {
      try {
        const stored = await storage.read();
        if (stored === null || !isAuthSession(stored)) {
          activeSession = null;
          return { status: 'signed_out' };
        }

        const currentTime = now();
        if (!isRefreshTokenValid(stored, currentTime)) {
          await storage.clear();
          activeSession = null;
          return { status: 'signed_out' };
        }
        if (isAccessTokenValid(stored, currentTime)) {
          activeSession = stored;
          return { status: 'signed_in', session: stored };
        }
        return await refreshStoredSession(stored);
      } catch {
        activeSession = null;
        return { status: 'signed_out' };
      }
    },

    async signIn(providerName) {
      try {
        const proof = await provider.signIn(providerName);
        if (proof === null) return { status: 'signed_out' };
        if (
          proof.provider !== providerName ||
          !isNonEmptyString(proof.proof) ||
          !isNonEmptyString(proof.nonce)
        ) {
          return { status: 'error', message: messages.signInFailed };
        }

        const session = await api.exchange(proof);
        if (!isAuthSession(session)) {
          return { status: 'error', message: messages.signInFailed };
        }

        const storedSession = activeSession ?? (await storage.read());
        if (
          storedSession !== null &&
          isAuthSession(storedSession) &&
          storedSession.accountId !== session.accountId
        ) {
          return { status: 'error', message: messages.signInFailed };
        }

        await storage.write(session);
        activeSession = session;
        return { status: 'signed_in', session };
      } catch {
        return { status: 'error', message: messages.signInFailed };
      }
    },

    async signOut() {
      const stored = activeSession ?? (await storage.read());
      if (stored === null || !isAuthSession(stored)) {
        await storage.clear();
        activeSession = null;
        return { status: 'signed_out' };
      }

      await api.signOut(stored.refreshToken);
      await cleanup(stored.accountId);
      await storage.clear();
      activeSession = null;
      return { status: 'signed_out' };
    },
  };
}

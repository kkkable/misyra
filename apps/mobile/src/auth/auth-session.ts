import {
  authTokenPairSchema,
  type AuthProvider as SharedAuthProvider,
  type AuthTokenPair,
} from '@misyra/contracts';

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
  signIn(provider: AuthProvider): Promise<ProviderProof>;
};

export type AuthExchangeApi = {
  exchange(input: ProviderProof): Promise<AuthSession>;
};

export type AuthState =
  | { readonly status: 'signed_out' }
  | { readonly status: 'signed_in'; readonly session: AuthSession }
  | { readonly status: 'error'; readonly message: string };

export type AuthSessionController = {
  restore(): Promise<AuthState>;
  signIn(provider: AuthProvider): Promise<AuthState>;
};

type AuthSessionControllerOptions = {
  readonly storage: AuthSessionStorage;
  readonly provider: ProviderSignInGateway;
  readonly api: AuthExchangeApi;
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

function isValidStoredSession(session: AuthSession, now: Date) {
  return (
    Date.parse(session.accessTokenExpiresAt) > now.getTime() &&
    Date.parse(session.refreshTokenExpiresAt) > now.getTime()
  );
}

export function createAuthSessionController({
  storage,
  provider,
  api,
  now = () => new Date(),
  messages,
}: AuthSessionControllerOptions): AuthSessionController {
  let activeSession: AuthSession | null = null;

  return {
    async restore() {
      try {
        const stored = await storage.read();
        if (stored !== null && isAuthSession(stored) && isValidStoredSession(stored, now())) {
          activeSession = stored;
          return { status: 'signed_in', session: stored };
        }
      } catch {
        activeSession = null;
      }
      activeSession = null;
      return { status: 'signed_out' };
    },

    async signIn(providerName) {
      try {
        const proof = await provider.signIn(providerName);
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
  };
}

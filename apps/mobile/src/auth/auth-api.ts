import { isAuthSession, type AuthExchangeApi } from './auth-session.js';

type FetchResponse = {
  readonly ok: boolean;
  json(): Promise<unknown>;
};

type Fetcher = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: { readonly 'content-type': 'application/json' };
    readonly body: string;
  },
) => Promise<FetchResponse>;

type AuthExchangeApiOptions = {
  readonly baseUrl: string;
  readonly fetcher?: Fetcher;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function post(fetcher: Fetcher, url: string, body: unknown) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();
  if (
    !response.ok ||
    typeof responseBody !== 'object' ||
    responseBody === null ||
    Array.isArray(responseBody) ||
    (responseBody as Record<string, unknown>).ok !== true
  ) {
    throw new Error('auth_request_failed');
  }
  return (responseBody as Record<string, unknown>).payload;
}

export function createAuthExchangeApi({
  baseUrl,
  fetcher = fetch,
}: AuthExchangeApiOptions): AuthExchangeApi {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    async exchange({ provider, proof, nonce }) {
      const payload = await post(fetcher, `${normalizedBaseUrl}/v1/auth/${provider}/exchange`, {
        proof,
        nonce,
      });
      if (!isAuthSession(payload)) throw new Error('auth_exchange_failed');
      return payload;
    },

    async refresh(refreshToken) {
      const payload = await post(fetcher, `${normalizedBaseUrl}/v1/auth/refresh`, { refreshToken });
      if (!isAuthSession(payload)) throw new Error('auth_refresh_failed');
      return payload;
    },

    async signOut(refreshToken) {
      const payload = await post(fetcher, `${normalizedBaseUrl}/v1/auth/sign-out`, { refreshToken });
      if (
        typeof payload !== 'object' ||
        payload === null ||
        Array.isArray(payload) ||
        (payload as Record<string, unknown>).signedOut !== true
      ) {
        throw new Error('auth_sign_out_failed');
      }
    },
  };
}

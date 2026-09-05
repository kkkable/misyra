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

export function createAuthExchangeApi({
  baseUrl,
  fetcher = fetch,
}: AuthExchangeApiOptions): AuthExchangeApi {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    async exchange({ provider, proof, nonce }) {
      const response = await fetcher(`${normalizedBaseUrl}/v1/auth/${provider}/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proof, nonce }),
      });
      const body = await response.json();
      if (
        !response.ok ||
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        (body as Record<string, unknown>).ok !== true
      ) {
        throw new Error('auth_exchange_failed');
      }

      const payload = (body as Record<string, unknown>).payload;
      if (!isAuthSession(payload)) throw new Error('auth_exchange_failed');
      return payload;
    },
  };
}

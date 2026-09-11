import type { NoEvidenceCompletionMode } from './private-trust-completion.js';

type FetchResponse = Readonly<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

type FetchInit = Readonly<{
  method: 'POST';
  headers: Readonly<{
    authorization: string;
    'content-type': string;
  }>;
  body: string;
}>;

type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

type CompleteMissionWithoutEvidenceInput = Readonly<{
  baseUrl: string;
  accessToken: string;
  occurrenceId: string;
  mode: NoEvidenceCompletionMode;
  effectiveActionAt: string;
  deviceId: string;
  idempotencyKey: string;
  fetcher?: Fetcher;
}>;

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function successfulEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).ok === true
  );
}

export async function completeMissionWithoutEvidence({
  baseUrl,
  accessToken,
  occurrenceId,
  mode,
  effectiveActionAt,
  deviceId,
  idempotencyKey,
  fetcher = fetch,
}: CompleteMissionWithoutEvidenceInput): Promise<void> {
  const response = await fetcher(
    `${normalizedBaseUrl(baseUrl)}/v1/missions/${encodeURIComponent(occurrenceId)}/complete`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        completionMode: mode,
        effectiveActionAt,
        deviceId,
        idempotencyKey,
      }),
    },
  );
  const body = await response.json();
  if (!response.ok || !successfulEnvelope(body)) {
    throw new Error('completion_request_failed');
  }
}

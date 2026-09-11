import {
  apiResponseEnvelopeSchema,
  completeMissionRequestSchema,
  completeMissionResultSchema,
} from '@misyra/contracts';

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
  const requestBody = completeMissionRequestSchema.parse({
    completionMode: mode,
    effectiveActionAt,
    deviceId,
    idempotencyKey,
  });
  const response = await fetcher(
    `${normalizedBaseUrl(baseUrl)}/v1/missions/${encodeURIComponent(occurrenceId)}/complete`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );
  const body = await response.json();
  const envelope = apiResponseEnvelopeSchema.safeParse(body);
  if (!response.ok || !envelope.success || !envelope.data.ok) {
    throw new Error('completion_request_failed');
  }
  const result = completeMissionResultSchema.safeParse(envelope.data.payload);
  if (!result.success) throw new Error('completion_request_failed');
}

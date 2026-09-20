import {
  evidenceVerificationReasonCodeSchema,
  type EvidenceVerificationReasonCode,
} from '@misyra/contracts';

export type EvidenceAttemptReservation = Readonly<{
  attemptId: string;
  occurrenceId: string;
  attemptNumber: 1 | 2 | 3;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  mediaAssetId: string;
  uploadPath: string;
}>;

export type EvidenceAttemptResult = Readonly<{
  attemptId: string;
  occurrenceId: string;
  attemptNumber: 1 | 2 | 3;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  verificationStatus: 'pending' | 'queued' | 'accepted' | 'rejected';
  reasonCode: EvidenceVerificationReasonCode | null;
  expired: boolean;
}>;

type EvidenceApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('evidence_request_failed');
  }
  return value.payload;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label);
  return value;
}

function attemptNumber(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) throw new Error('evidence_attempt_number_invalid');
  return value;
}

function parseLatestAttemptId(value: unknown): string | null {
  if (!isRecord(value) || !Object.hasOwn(value, 'attemptId')) {
    throw new Error('evidence_latest_attempt_invalid');
  }
  if (value.attemptId === null) return null;
  return nonEmptyString(value.attemptId, 'evidence_attempt_id_invalid');
}

function parseReservation(value: unknown): EvidenceAttemptReservation {
  if (!isRecord(value)) throw new Error('evidence_reservation_invalid');
  return {
    attemptId: nonEmptyString(value.attemptId, 'evidence_attempt_id_invalid'),
    occurrenceId: nonEmptyString(value.occurrenceId, 'evidence_occurrence_id_invalid'),
    attemptNumber: attemptNumber(value.attemptNumber),
    firstSubmittedAt: nonEmptyString(value.firstSubmittedAt, 'evidence_first_submit_invalid'),
    effectiveSubmittedAt: nonEmptyString(
      value.effectiveSubmittedAt,
      'evidence_effective_submit_invalid',
    ),
    mediaAssetId: nonEmptyString(value.mediaAssetId, 'evidence_media_asset_invalid'),
    uploadPath: nonEmptyString(value.uploadPath, 'evidence_upload_path_invalid'),
  };
}

function parseResult(value: unknown): EvidenceAttemptResult {
  if (!isRecord(value)) throw new Error('evidence_result_invalid');
  const verificationStatus = value.verificationStatus;
  if (
    verificationStatus !== 'pending' &&
    verificationStatus !== 'queued' &&
    verificationStatus !== 'accepted' &&
    verificationStatus !== 'rejected'
  ) {
    throw new Error('evidence_verification_status_invalid');
  }
  const reason =
    value.reasonCode === null
      ? null
      : evidenceVerificationReasonCodeSchema.safeParse(value.reasonCode);
  if (reason !== null && !reason.success) throw new Error('evidence_reason_code_invalid');
  if (typeof value.expired !== 'boolean') throw new Error('evidence_expiry_invalid');
  return {
    attemptId: nonEmptyString(value.attemptId, 'evidence_attempt_id_invalid'),
    occurrenceId: nonEmptyString(value.occurrenceId, 'evidence_occurrence_id_invalid'),
    attemptNumber: attemptNumber(value.attemptNumber),
    firstSubmittedAt: nonEmptyString(value.firstSubmittedAt, 'evidence_first_submit_invalid'),
    effectiveSubmittedAt: nonEmptyString(
      value.effectiveSubmittedAt,
      'evidence_effective_submit_invalid',
    ),
    verificationStatus,
    reasonCode: reason === null ? null : reason.data,
    expired: value.expired,
  };
}

export function createEvidenceApi({ baseUrl, accessToken }: EvidenceApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const authorization = `Bearer ${accessToken}`;

  async function jsonRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: {
        authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseBody = await response.json();
    if (!response.ok) throw new Error('evidence_request_failed');
    return payloadFromEnvelope(responseBody);
  }

  return Object.freeze({
    async getLatestAttemptId(occurrenceId: string) {
      return parseLatestAttemptId(
        await jsonRequest(
          `/v1/evidence/occurrences/${encodeURIComponent(occurrenceId)}/latest-attempt`,
          'GET',
        ),
      );
    },

    async reserveAttempt(
      occurrenceId: string,
      input: Readonly<{ attemptId: string; submittedAt: string }>,
    ) {
      return parseReservation(
        await jsonRequest(
          `/v1/evidence/occurrences/${encodeURIComponent(occurrenceId)}/attempts`,
          'POST',
          {
            attemptId: input.attemptId,
            submittedAt: input.submittedAt,
            contentType: 'image/jpeg',
          },
        ),
      );
    },

    async uploadOriginal(uploadPath: string, fileUri: string) {
      const file = await fetch(fileUri);
      if (!file.ok) throw new Error('evidence_local_file_unavailable');
      const body = await file.blob();
      const response = await fetch(`${root}${uploadPath}`, {
        method: 'PUT',
        headers: {
          authorization,
          'content-type': 'application/octet-stream',
        },
        body,
      });
      if (!response.ok) throw new Error('evidence_upload_failed');
      await response.json();
    },

    async getResult(attemptId: string) {
      return parseResult(
        await jsonRequest(`/v1/evidence/attempts/${encodeURIComponent(attemptId)}`, 'GET'),
      );
    },
  });
}

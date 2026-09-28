import {
  IdempotencyConflictError,
  IncompleteIdempotencyRecordError,
} from '@misyra/database';
import type { FastifyRequest } from 'fastify';

import { ApiError, type ApiRouteDefinition } from './index.js';
import type { RetainedFeedbackService } from './retained-feedback.js';

const MAX_FEEDBACK_BODY_BYTES = 12 * 1024 * 1024;

function multipartBoundary(contentType: string | undefined): string {
  if (contentType === undefined) throw new RangeError('feedback_content_type_invalid');
  const match = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary) throw new RangeError('feedback_boundary_missing');
  return boundary;
}

function trimMultipartPart(part: Buffer): Buffer {
  let start = 0;
  let end = part.length;
  if (part.subarray(0, 2).toString('ascii') === '\r\n') start = 2;
  if (part.subarray(Math.max(start, end - 2), end).toString('ascii') === '\r\n') end -= 2;
  return part.subarray(start, end);
}

function multipartParts(body: Buffer, boundary: string) {
  const marker = Buffer.from(`--${boundary}`);
  const parts: Array<Readonly<{ headers: string; body: Buffer }>> = [];
  let markerStart = body.indexOf(marker);

  while (markerStart >= 0) {
    const afterMarker = markerStart + marker.length;
    if (body.subarray(afterMarker, afterMarker + 2).toString('ascii') === '--') break;
    const nextMarker = body.indexOf(marker, afterMarker);
    if (nextMarker < 0) break;

    const part = trimMultipartPart(body.subarray(afterMarker, nextMarker));
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) throw new RangeError('feedback_multipart_invalid');
    parts.push({
      headers: part.subarray(0, headerEnd).toString('utf8'),
      body: part.subarray(headerEnd + 4),
    });
    markerStart = nextMarker;
  }

  return parts;
}

function partName(headers: string): string | null {
  const match = /content-disposition:[^\r\n]*\bname="([^"]+)"/iu.exec(headers);
  return match?.[1] ?? null;
}

function partContentType(headers: string): string | null {
  const match = /content-type:\s*([^\r\n]+)/iu.exec(headers);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function parsePayload(value: Buffer): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('feedback_payload_invalid');
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new RangeError('feedback_payload_invalid', { cause: error });
  }
}

export function parseRetainedFeedbackRequest(request: FastifyRequest): unknown {
  if (!Buffer.isBuffer(request.body)) throw new RangeError('feedback_multipart_required');
  const boundary = multipartBoundary(request.headers['content-type']);
  const parts = multipartParts(request.body, boundary);
  const payloadPart = parts.find((part) => partName(part.headers) === 'payload');
  if (payloadPart === undefined) throw new RangeError('feedback_payload_missing');
  const payload = parsePayload(payloadPart.body);

  const screenshotPart = parts.find((part) => partName(part.headers) === 'screenshot');
  const screenshotMetadata = payload.screenshot;
  let screenshot: unknown = null;
  if (screenshotPart !== undefined) {
    if (
      typeof screenshotMetadata !== 'object' ||
      screenshotMetadata === null ||
      Array.isArray(screenshotMetadata)
    ) {
      throw new RangeError('feedback_screenshot_metadata_missing');
    }
    const metadata = screenshotMetadata as Readonly<Record<string, unknown>>;
    const mimeType = partContentType(screenshotPart.headers);
    if (mimeType !== 'image/png' || metadata.mimeType !== 'image/png') {
      throw new RangeError('feedback_screenshot_invalid');
    }
    screenshot = {
      bytes: screenshotPart.body,
      mimeType: 'image/png',
      sizeBytes: metadata.sizeBytes,
    };
  } else if (screenshotMetadata !== null) {
    throw new RangeError('feedback_screenshot_missing');
  }

  return {
    idempotencyKey: payload.idempotencyKey,
    category: payload.category,
    description: payload.description,
    email: payload.email,
    technicalDetails: payload.technicalDetails,
    screenshot,
  };
}

export function createRetainedFeedbackRoutes(service: RetainedFeedbackService): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/feedback',
      bodyLimit: MAX_FEEDBACK_BODY_BYTES,
      async handler(request, _reply, auth) {
        try {
          return await service.submit(auth.accountId, parseRetainedFeedbackRequest(request));
        } catch (error) {
          if (error instanceof RangeError) throw new ApiError('validation_failed');
          if (error instanceof IdempotencyConflictError) throw new ApiError('conflict');
          if (error instanceof IncompleteIdempotencyRecordError) {
            throw new ApiError('temporarily_unavailable');
          }
          throw error;
        }
      },
    },
  ];
}

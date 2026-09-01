import { Temporal } from '@js-temporal/polyfill';

export type MediaPurpose =
  | 'evidence-working'
  | 'story-working'
  | 'planner-working'
  | 'style-references'
  | 'feedback-retained';

export type MediaRetentionClass = 'product_media_30_day' | 'feedback_retained';

export interface MediaDeletionDueInput {
  readonly purpose: string;
  readonly createdAt: string;
  readonly now: string;
}

const PRODUCT_MEDIA_RETENTION_HOURS = 30 * 24;

function parseInstant(value: string, label: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new TypeError(`${label} must be a valid absolute timestamp.`);
  }
}

function toIsoInstant(instant: Temporal.Instant): string {
  return new Date(instant.epochMilliseconds).toISOString();
}

export function classifyMediaPurpose(purpose: string): MediaRetentionClass {
  switch (purpose) {
    case 'evidence-working':
    case 'story-working':
    case 'planner-working':
    case 'style-references':
      return 'product_media_30_day';
    case 'feedback-retained':
      return 'feedback_retained';
    default:
      throw new TypeError(`Invalid media purpose: ${purpose}.`);
  }
}

export function calculateMediaDeletionDeadline(createdAt: string, purpose: string): string | null {
  const retentionClass = classifyMediaPurpose(purpose);
  const created = parseInstant(createdAt, 'Media created time');

  if (retentionClass === 'feedback_retained') {
    return null;
  }

  return toIsoInstant(created.add({ hours: PRODUCT_MEDIA_RETENTION_HOURS }));
}

export function isMediaDeletionDue(input: MediaDeletionDueInput): boolean {
  const retentionClass = classifyMediaPurpose(input.purpose);
  const created = parseInstant(input.createdAt, 'Media created time');
  const now = parseInstant(input.now, 'Current time');

  if (retentionClass === 'feedback_retained') {
    return false;
  }

  const deadline = created.add({ hours: PRODUCT_MEDIA_RETENTION_HOURS });
  return Temporal.Instant.compare(now, deadline) >= 0;
}

export function shouldGenerateMediaDeletionNotice(purpose: string): boolean {
  classifyMediaPurpose(purpose);
  return purpose === 'evidence-working';
}

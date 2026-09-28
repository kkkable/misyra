import type { FeedbackFormDraft, FeedbackScreenshot } from './feedback-form.js';

export type FeedbackTechnicalDetails = Readonly<{
  appVersion?: string;
  buildVersion?: string;
  deviceModel?: string;
  osVersion?: string;
  screenName?: string;
  errorCodes?: readonly string[];
  crashIdentifiers?: readonly string[];
  networkState?: string;
  submissionTimestamp?: string;
}>;

export type FeedbackSubmissionPayload = Readonly<{
  category: FeedbackFormDraft['category'];
  description: string;
  email: string | null;
  screenshot: FeedbackScreenshot | null;
  technicalDetails: FeedbackTechnicalDetails;
}>;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalStringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length > 0 ? Object.freeze(items) : undefined;
}

export function sanitizeFeedbackTechnicalDetails(
  input: Readonly<Record<string, unknown>>,
): FeedbackTechnicalDetails {
  const result: {
    appVersion?: string;
    buildVersion?: string;
    deviceModel?: string;
    osVersion?: string;
    screenName?: string;
    errorCodes?: readonly string[];
    crashIdentifiers?: readonly string[];
    networkState?: string;
    submissionTimestamp?: string;
  } = {};

  const appVersion = optionalString(input.appVersion);
  if (appVersion !== undefined) result.appVersion = appVersion;
  const buildVersion = optionalString(input.buildVersion);
  if (buildVersion !== undefined) result.buildVersion = buildVersion;
  const deviceModel = optionalString(input.deviceModel);
  if (deviceModel !== undefined) result.deviceModel = deviceModel;
  const osVersion = optionalString(input.osVersion);
  if (osVersion !== undefined) result.osVersion = osVersion;
  const screenName = optionalString(input.screenName);
  if (screenName !== undefined) result.screenName = screenName;
  const errorCodes = optionalStringList(input.errorCodes);
  if (errorCodes !== undefined) result.errorCodes = errorCodes;
  const crashIdentifiers = optionalStringList(input.crashIdentifiers);
  if (crashIdentifiers !== undefined) result.crashIdentifiers = crashIdentifiers;
  const networkState = optionalString(input.networkState);
  if (networkState !== undefined) result.networkState = networkState;
  const submissionTimestamp = optionalString(input.submissionTimestamp);
  if (submissionTimestamp !== undefined) result.submissionTimestamp = submissionTimestamp;

  return Object.freeze(result);
}

export function createFeedbackSubmissionPayload({
  draft,
  technicalDetails,
}: Readonly<{
  draft: FeedbackFormDraft;
  technicalDetails: FeedbackTechnicalDetails;
}>): FeedbackSubmissionPayload {
  if (draft.description.trim().length === 0) {
    throw new RangeError('feedback_description_required');
  }

  const email = draft.email.trim();
  return Object.freeze({
    category: draft.category,
    description: draft.description.trim(),
    email: email.length === 0 ? null : email,
    screenshot: draft.screenshot,
    technicalDetails: sanitizeFeedbackTechnicalDetails(
      technicalDetails as Readonly<Record<string, unknown>>,
    ),
  });
}

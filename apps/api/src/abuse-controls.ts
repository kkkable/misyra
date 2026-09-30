/**
 * MTS-110 declared abuse-control policy.
 *
 * This module records the request-rate and body-size budget that every API route is expected to
 * live within. MTS-111 wires these calibrated values into the Fastify request boundary; route
 * inventory tests keep the policy complete as endpoints are added.
 */

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 * KIBIBYTE;

export type AbuseControlKey = 'ip' | 'account' | 'device' | 'channel';

export type AbuseControlClass = Readonly<{
  /** Fixed window length in seconds. */
  windowSeconds: number;
  /** Maximum requests per key inside one window. */
  maxRequests: number;
  /** Maximum request body size in bytes (0 for body-less routes). */
  maxBodyBytes: number;
  /** What identifies one client for counting purposes. */
  keyedBy: AbuseControlKey;
}>;

export const abuseControlClasses = {
  // Unauthenticated surfaces: keyed by network origin or provider channel, never by account.
  'public-auth-exchange': {
    windowSeconds: 60,
    maxRequests: 10,
    maxBodyBytes: 16 * KIBIBYTE,
    keyedBy: 'ip',
  },
  'public-auth-session': {
    windowSeconds: 60,
    maxRequests: 30,
    maxBodyBytes: 4 * KIBIBYTE,
    keyedBy: 'ip',
  },
  'public-oauth-callback': { windowSeconds: 60, maxRequests: 20, maxBodyBytes: 0, keyedBy: 'ip' },
  'public-webhook': {
    windowSeconds: 60,
    maxRequests: 120,
    maxBodyBytes: 8 * KIBIBYTE,
    keyedBy: 'ip',
  },
  // Authenticated surfaces: keyed by account (or device for sync).
  'authenticated-read': {
    windowSeconds: 60,
    maxRequests: 300,
    maxBodyBytes: 0,
    keyedBy: 'account',
  },
  'authenticated-write': {
    windowSeconds: 60,
    maxRequests: 120,
    maxBodyBytes: 64 * KIBIBYTE,
    keyedBy: 'account',
  },
  'account-sensitive': {
    windowSeconds: 3600,
    maxRequests: 10,
    maxBodyBytes: 4 * KIBIBYTE,
    keyedBy: 'account',
  },
  sync: {
    windowSeconds: 60,
    maxRequests: 60,
    maxBodyBytes: 1 * MEBIBYTE,
    keyedBy: 'account',
  },
  'media-upload-authorization': {
    windowSeconds: 60,
    maxRequests: 30,
    maxBodyBytes: 8 * KIBIBYTE,
    keyedBy: 'account',
  },
  'media-upload': {
    windowSeconds: 60,
    maxRequests: 30,
    maxBodyBytes: 12 * MEBIBYTE,
    keyedBy: 'account',
  },
  'feedback-submission': {
    windowSeconds: 3600,
    maxRequests: 20,
    maxBodyBytes: 12 * MEBIBYTE,
    keyedBy: 'account',
  },
  'ai-request': {
    windowSeconds: 3600,
    maxRequests: 30,
    maxBodyBytes: 256 * KIBIBYTE,
    keyedBy: 'account',
  },
  'health-probe': { windowSeconds: 60, maxRequests: 600, maxBodyBytes: 0, keyedBy: 'ip' },
} as const satisfies Record<string, AbuseControlClass>;

export type AbuseControlClassName = keyof typeof abuseControlClasses;

/** Product limits that bound AI abuse independently of request rate (technical specification). */
export const aiGenerationLimits = {
  /** "maximum three AI generation/regeneration requests per mission". */
  maxRequestsPerMission: 3,
  /** AI Planner accepts text and/or up to three images. */
  maxPlannerImages: 3,
} as const;

/** Runtime status marker. MTS-111 wires these route budgets into the Fastify boundary. */
export const abuseControlEnforcement = {
  status: 'enforced',
  enforcedBy: 'MTS-111',
} as const;

/** Every `/v1` route, keyed `METHOD /path` exactly as declared in the route modules. */
export const routeAbuseControls = {
  // Public routes.
  'POST /auth/:provider/exchange': 'public-auth-exchange',
  'POST /auth/refresh': 'public-auth-session',
  'POST /auth/sign-out': 'public-auth-session',
  'GET /calendars/google/callback': 'public-oauth-callback',
  'POST /webhooks/google-calendar': 'public-webhook',
  // Sensitive account operations.
  'POST /auth/reauthenticate': 'account-sensitive',
  'DELETE /account': 'account-sensitive',
  // Calendar connections.
  'POST /calendars/apple/connect': 'authenticated-write',
  'POST /calendars/google/connect': 'authenticated-write',
  'POST /calendars/disconnect': 'authenticated-write',
  'GET /calendars/connection': 'authenticated-read',
  'GET /calendars/hidden-events': 'authenticated-read',
  'POST /calendars/hidden-events/:hiddenId/restore': 'authenticated-write',
  // Missions, devices, and settings.
  'POST /missions/:occurrenceId/complete': 'authenticated-write',
  'POST /devices/register': 'authenticated-write',
  'GET /account/settings': 'authenticated-read',
  'PATCH /account/settings': 'authenticated-write',
  // Evidence.
  'GET /evidence/occurrences/:occurrenceId/attempts': 'authenticated-read',
  'GET /evidence/occurrences/:occurrenceId/latest-attempt': 'authenticated-read',
  'GET /evidence/attempts/:attemptId': 'authenticated-read',
  'GET /evidence/attempts/:attemptId/media/original': 'authenticated-read',
  'DELETE /evidence/attempts/:attemptId/media': 'authenticated-write',
  'POST /evidence/occurrences/:occurrenceId/attempts': 'authenticated-write',
  // Protected media and feedback.
  'POST /media/assets/:assetId/upload-authorizations': 'media-upload-authorization',
  'PUT /media/uploads/:token': 'media-upload',
  'POST /feedback': 'feedback-submission',
  // AI-backed operations.
  'POST /ai-planner/drafts/:draftId/extract': 'ai-request',
  'POST /ai-planner/drafts/:draftId/confirm': 'authenticated-write',
  'POST /stories/:draftId/image-generations': 'ai-request',
  'POST /stories/:occurrenceId/text-suggestions': 'ai-request',
  'POST /stories/style-profile/rebuild': 'ai-request',
  'POST /stories/style-profile/default': 'authenticated-write',
  'GET /stories/style-profile': 'authenticated-read',
  'GET /stories/:draftId/image-generation-budget': 'authenticated-read',
  'GET /stories/:draftId/image-versions/:versionId/media': 'authenticated-read',
  'DELETE /stories/:draftId/image-versions/:versionId': 'authenticated-write',
  // Synchronization.
  'POST /sync/push': 'sync',
  'GET /sync/pull': 'sync',
  'GET /sync/snapshot': 'sync',
  'POST /sync/apple-calendar/commands/claim': 'sync',
  'POST /sync/apple-calendar/commands/settle': 'sync',
} as const satisfies Record<string, AbuseControlClassName>;

/** Unversioned operational routes registered outside the `/v1` plugin. */
export const unversionedRouteAbuseControls = {
  'GET /health/live': 'health-probe',
  'GET /health/ready': 'health-probe',
} as const satisfies Record<string, AbuseControlClassName>;

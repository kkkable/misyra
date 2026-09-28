export type DiagnosticsAutomaticCapturePolicy = Readonly<{
  screenshots: false;
  sessionReplay: false;
  viewHierarchy: false;
}>;

export const diagnosticsAutomaticCapturePolicy: DiagnosticsAutomaticCapturePolicy = Object.freeze({
  screenshots: false,
  sessionReplay: false,
  viewHierarchy: false,
});

const ALLOWED_DIAGNOSTICS_FIELDS = [
  'event',
  'appVersion',
  'buildVersion',
  'deviceClass',
  'osVersion',
  'screen',
  'errorCode',
  'crashId',
  'networkState',
  'durationMs',
  'timestamp',
] as const;

type AllowedDiagnosticsField = (typeof ALLOWED_DIAGNOSTICS_FIELDS)[number];

export type DiagnosticsPayload = Partial<Record<AllowedDiagnosticsField, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function scrubDiagnosticsPayload(input: unknown): DiagnosticsPayload {
  if (!isRecord(input)) return Object.freeze({});

  const scrubbed: DiagnosticsPayload = {};
  for (const field of ALLOWED_DIAGNOSTICS_FIELDS) {
    if (Object.hasOwn(input, field)) scrubbed[field] = input[field];
  }
  return Object.freeze(scrubbed);
}

export type DiagnosticsSender = (payload: DiagnosticsPayload) => Promise<void>;

export function createMobileDiagnosticsRuntime({
  send,
  initiallyEnabled = true,
}: Readonly<{
  send: DiagnosticsSender;
  initiallyEnabled?: boolean;
}>) {
  let enabled = initiallyEnabled;

  return Object.freeze({
    isEnabled(): boolean {
      return enabled;
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
    },
    async capture(input: unknown): Promise<void> {
      if (!enabled) return;
      await send(scrubDiagnosticsPayload(input));
    },
  });
}

export const rootDiagnosticsRuntime = createMobileDiagnosticsRuntime({
  send: () => Promise.resolve(),
});

import { describe, expect, it, vi } from 'vitest';

async function diagnosticsModule() {
  return import('./mobile-diagnostics.js');
}

const unsafeInput = Object.freeze({
  event: 'reliability',
  appVersion: '1.4.0',
  buildVersion: '140',
  deviceClass: 'phone-midrange',
  osVersion: 'iOS 18.6',
  screen: 'calendar',
  errorCode: 'calendar_refresh_failed',
  crashId: 'crash-123',
  networkState: 'wifi',
  durationMs: 321,
  timestamp: '2026-09-28T03:55:00.000Z',
  missionTitle: 'Private mission title',
  missionNotes: 'Private mission notes',
  calendarContent: 'Private calendar event',
  aiPlannerInput: 'Plan my private day',
  evidencePhoto: 'file:///private/evidence.jpg',
  storyContent: 'Private Story text',
  token: 'secret-token',
  location: 'Private place',
  preciseLocation: { latitude: 22.3, longitude: 114.2 },
  screenshot: 'base64-private-image',
  viewHierarchy: '<private-tree />',
  sessionReplay: 'private-replay',
});

describe('MTS-105 allowlisted mobile diagnostics', () => {
  it('snapshots only approved telemetry fields and disables automatic capture surfaces', async () => {
    const { diagnosticsAutomaticCapturePolicy, scrubDiagnosticsPayload } =
      await diagnosticsModule();

    expect(scrubDiagnosticsPayload(unsafeInput)).toMatchInlineSnapshot(`
      {
        "appVersion": "1.4.0",
        "buildVersion": "140",
        "crashId": "crash-123",
        "deviceClass": "phone-midrange",
        "durationMs": 321,
        "errorCode": "calendar_refresh_failed",
        "event": "reliability",
        "networkState": "wifi",
        "osVersion": "iOS 18.6",
        "screen": "calendar",
        "timestamp": "2026-09-28T03:55:00.000Z",
      }
    `);
    expect(diagnosticsAutomaticCapturePolicy).toEqual({
      screenshots: false,
      sessionReplay: false,
      viewHierarchy: false,
    });
  });

  it('uses an allowlist so unknown and content-bearing fields cannot survive scrubbing', async () => {
    const { scrubDiagnosticsPayload } = await diagnosticsModule();
    const scrubbed = scrubDiagnosticsPayload({
      ...unsafeInput,
      arbitraryFutureContent: 'must not pass through',
    });
    const serialized = JSON.stringify(scrubbed);

    for (const forbidden of [
      'Private mission title',
      'Private mission notes',
      'Private calendar event',
      'Plan my private day',
      'evidence.jpg',
      'Private Story text',
      'secret-token',
      'Private place',
      'latitude',
      'base64-private-image',
      'private-tree',
      'private-replay',
      'arbitraryFutureContent',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('is enabled by default and stops collection immediately when disabled', async () => {
    const { createMobileDiagnosticsRuntime } = await diagnosticsModule();
    const send = vi.fn(() => Promise.resolve());
    const runtime = createMobileDiagnosticsRuntime({ send });

    expect(runtime.isEnabled()).toBe(true);
    await runtime.capture(unsafeInput);
    runtime.setEnabled(false);
    expect(runtime.isEnabled()).toBe(false);
    await runtime.capture({ ...unsafeInput, errorCode: 'must_not_send' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls)).not.toContain('must_not_send');
  });
});

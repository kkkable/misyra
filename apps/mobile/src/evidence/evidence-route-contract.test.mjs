import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const evidenceRoutePath = fileURLToPath(new URL('../../app/evidence.tsx', import.meta.url));
const mobilePackagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
const evidenceRuntimePath = fileURLToPath(
  new URL('./expo-evidence-capture-runtime.tsx', import.meta.url),
);
const evidenceMediaActionsPath = fileURLToPath(
  new URL('./expo-evidence-media-actions-runtime.ts', import.meta.url),
);
const rootSyncRuntimePath = fileURLToPath(new URL('../sync/root-sync-runtime.ts', import.meta.url));

describe('MTS-079 camera-only route contract', () => {
  it('wires the Evidence modal to the camera runtime without any gallery picker path', () => {
    const source = readFileSync(evidenceRoutePath, 'utf8');
    const mobilePackage = JSON.parse(readFileSync(mobilePackagePath, 'utf8'));

    expect(source).toMatch(/EvidenceCaptureScreen/);
    expect(source).toMatch(/createExpoEvidenceCaptureRuntime/);
    expect(source).toMatch(/getLatestAttemptId\(occurrenceId\)/);

    for (const forbidden of [
      /expo-image-picker/,
      /launchImageLibrary/i,
      /pickImage/i,
      /gallery/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }

    expect(mobilePackage.dependencies).not.toHaveProperty('expo-image-picker');
    expect(mobilePackage.dependencies).toHaveProperty('expo-media-library');
  });

  it('keeps photo-library access behind the explicit evidence Save to Photos runtime', () => {
    const routeSource = readFileSync(evidenceRoutePath, 'utf8');
    const captureSource = readFileSync(evidenceRuntimePath, 'utf8');
    const mediaActionsSource = readFileSync(evidenceMediaActionsPath, 'utf8');

    expect(captureSource).not.toMatch(/expo-media-library/);
    expect(mediaActionsSource).toMatch(/expo-media-library/);
    expect(routeSource).toMatch(/createExpoEvidenceMediaActionsRuntime/);
    expect(routeSource).toMatch(/saveToPhotos/);
    expect(routeSource).toMatch(/deleteEvidence/);
  });

  it('durably queues evidence before upload, restores local Waiting state, and drains it on root sync', () => {
    const routeSource = readFileSync(evidenceRoutePath, 'utf8');
    const rootSyncSource = readFileSync(rootSyncRuntimePath, 'utf8');

    expect(routeSource).toMatch(/createEvidenceOfflineQueue/);
    expect(routeSource).toMatch(/\.enqueue\(/);
    expect(routeSource).toMatch(/getPendingForOccurrence\(occurrenceId\)/);
    expect(routeSource).toMatch(/\.processPending\(\)/);

    expect(rootSyncSource).toMatch(/createEvidenceOfflineQueue/);
    expect(rootSyncSource).toMatch(/runEvidenceSync/);
    expect(rootSyncSource).toMatch(/processPending\(\)/);
  });

  it('moves the camera original into private working storage instead of leaving a duplicate', () => {
    const source = readFileSync(evidenceRuntimePath, 'utf8');

    expect(source).toMatch(/FileSystem\.moveAsync/);
    expect(source).not.toMatch(/FileSystem\.copyAsync/);
    expect(source).toMatch(/documentDirectory/);
    expect(source).toMatch(/evidence-working/);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const evidenceRoutePath = fileURLToPath(new URL('../../app/evidence.tsx', import.meta.url));
const mobilePackagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
const evidenceRuntimePath = fileURLToPath(
  new URL('./expo-evidence-capture-runtime.tsx', import.meta.url),
);

describe('MTS-079 camera-only route contract', () => {
  it('wires the Evidence modal to the camera runtime without any gallery picker path', () => {
    const source = readFileSync(evidenceRoutePath, 'utf8');
    const mobilePackage = JSON.parse(readFileSync(mobilePackagePath, 'utf8'));

    expect(source).toMatch(/EvidenceCaptureScreen/);
    expect(source).toMatch(/createExpoEvidenceCaptureRuntime/);

    for (const forbidden of [
      /expo-image-picker/,
      /launchImageLibrary/i,
      /pickImage/i,
      /gallery/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }

    expect(mobilePackage.dependencies).not.toHaveProperty('expo-image-picker');
    expect(mobilePackage.dependencies).not.toHaveProperty('expo-media-library');
  });

  it('moves the camera original into private working storage instead of leaving a duplicate', () => {
    const source = readFileSync(evidenceRuntimePath, 'utf8');

    expect(source).toMatch(/FileSystem\.moveAsync/);
    expect(source).not.toMatch(/FileSystem\.copyAsync/);
    expect(source).toMatch(/documentDirectory/);
    expect(source).toMatch(/evidence-working/);
  });
});

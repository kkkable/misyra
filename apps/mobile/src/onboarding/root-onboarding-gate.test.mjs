import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const rootLayoutPath = fileURLToPath(new URL('../../app/_layout.tsx', import.meta.url));
const onboardingRuntimePath = fileURLToPath(new URL('./onboarding-runtime.ts', import.meta.url));

describe('MTS-038 root onboarding composition', () => {
  it('places onboarding inside the authenticated child path before the Calendar tab stack', async () => {
    const source = await readFile(rootLayoutPath, 'utf8');

    expect(source).toContain('<AuthGate');
    expect(source).toContain('<OnboardingGate');
    expect(source.indexOf('<AuthGate')).toBeLessThan(source.indexOf('<OnboardingGate'));
    expect(source.indexOf('<OnboardingGate')).toBeLessThan(source.indexOf('<Stack'));
  });

  it('MTS-062 binds the explicit onboarding notification choice to a localized device permission service', async () => {
    const [layoutSource, runtimeSource] = await Promise.all([
      readFile(rootLayoutPath, 'utf8'),
      readFile(onboardingRuntimePath, 'utf8'),
    ]);

    expect(layoutSource).toContain('configureOnboardingNotificationPermissionRequest');
    expect(layoutSource).toContain('createExpoNotificationPermissionService');
    expect(layoutSource).toContain('rootOnboardingNotificationChannelName');
    expect(layoutSource).toContain('rootOnboardingNotificationPermissionService.request()');
    expect(runtimeSource).toContain(
      'notificationSettingsCatalogs[rootOnboardingLocale].notifications',
    );
  });
});

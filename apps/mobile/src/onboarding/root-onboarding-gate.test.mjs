import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const rootLayoutPath = fileURLToPath(new URL('../../app/_layout.tsx', import.meta.url));

describe('MTS-038 root onboarding composition', () => {
  it('places onboarding inside the authenticated child path before the Calendar tab stack', async () => {
    const source = await readFile(rootLayoutPath, 'utf8');

    expect(source).toContain('<AuthGate');
    expect(source).toContain('<OnboardingGate');
    expect(source.indexOf('<AuthGate')).toBeLessThan(source.indexOf('<OnboardingGate'));
    expect(source.indexOf('<OnboardingGate')).toBeLessThan(source.indexOf('<Stack'));
  });
});

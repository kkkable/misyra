import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const rootLayoutPath = fileURLToPath(new URL('../../app/_layout.tsx', import.meta.url));
const gatePath = fileURLToPath(new URL('./sync-runtime-gate.tsx', import.meta.url));

describe('MTS-031/MTS-039 signed-in root sync lifecycle', () => {
  it('composes synchronization after authentication and before onboarding/application routes', async () => {
    const source = await readFile(rootLayoutPath, 'utf8');

    expect(source).toContain('<AuthGate');
    expect(source).toContain('<SyncRuntimeGate');
    expect(source).toContain('<OnboardingGate');
    expect(source.indexOf('<AuthGate')).toBeLessThan(source.indexOf('<SyncRuntimeGate'));
    expect(source.indexOf('<SyncRuntimeGate')).toBeLessThan(source.indexOf('<OnboardingGate'));
  });

  it('uses TanStack Query for the server-sync lifecycle without gating local children on network state', async () => {
    const source = await readFile(gatePath, 'utf8');

    expect(source).toContain("from '@tanstack/react-query'");
    expect(source).toContain('useQuery');
    expect(source).toContain('void query');
    expect(source).toContain('return children');
  });
});

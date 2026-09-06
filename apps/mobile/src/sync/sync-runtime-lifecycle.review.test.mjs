import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const gatePath = fileURLToPath(new URL('./sync-runtime-gate.tsx', import.meta.url));
const rootRuntimePath = fileURLToPath(new URL('./root-sync-runtime.ts', import.meta.url));

describe('MTS-031/MTS-039 executable synchronization lifecycle review', () => {
  it('sources bearer credentials through the refresh-capable root auth controller', async () => {
    const source = await readFile(rootRuntimePath, 'utf8');

    expect(source).toContain('rootAuthController');
    expect(source).toContain('createSyncSessionProvider(rootAuthController)');
    expect(source).not.toContain('rootAuthStorage');
  });

  it('retries foreground synchronization and refetches when React Native becomes active', async () => {
    const source = await readFile(gatePath, 'utf8');

    expect(source).toContain('FOREGROUND_SYNC_INTERVAL_MS');
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain('focusManager.setFocused');
    expect(source).toContain("networkMode: 'always'");
    expect(source).toContain('refetchInterval: FOREGROUND_SYNC_INTERVAL_MS');
    expect(source).toContain('refetchIntervalInBackground: false');
    expect(source).toContain("refetchOnWindowFocus: 'always'");
  });
});

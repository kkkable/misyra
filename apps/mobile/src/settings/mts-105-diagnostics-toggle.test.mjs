import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('./settings-route.tsx', import.meta.url));

describe('MTS-105 diagnostics Settings opt-out', () => {
  it('renders Diagnostics as a toggle backed by the account preference', async () => {
    const source = await readFile(routePath, 'utf8');
    const rowStart = source.indexOf('testID="settings-row-diagnostics"');
    expect(rowStart).toBeGreaterThan(0);

    const window = source.slice(Math.max(0, rowStart - 900), rowStart + 900);
    expect(window).toContain('<ToggleRow');
    expect(window).toContain('diagnosticsEnabled');
    expect(window).toContain('onValueChange');
  });

  it('disables diagnostics synchronously before persisting the preference', async () => {
    const source = await readFile(routePath, 'utf8');
    const functionStart = source.indexOf('const updateDiagnostics');
    expect(functionStart).toBeGreaterThan(0);

    const functionSource = source.slice(functionStart, functionStart + 2200);
    const immediateToggle = functionSource.indexOf('rootDiagnosticsRuntime.setEnabled(enabled)');
    const networkPersistence = functionSource.indexOf('await authenticatedApi()');

    expect(immediateToggle).toBeGreaterThan(0);
    expect(networkPersistence).toBeGreaterThan(0);
    expect(immediateToggle).toBeLessThan(networkPersistence);
    expect(functionSource).toContain('updateAccountSettings({ diagnosticsEnabled: enabled })');
  });
});

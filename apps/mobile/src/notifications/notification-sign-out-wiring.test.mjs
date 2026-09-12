import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const authRuntimePath = fileURLToPath(new URL('../auth/auth-runtime.ts', import.meta.url));

describe('MTS-063 sign-out notification cleanup wiring', () => {
  it('binds sign-out cleanup to complete local notification cancellation', async () => {
    const source = await readFile(authRuntimePath, 'utf8');

    expect(source).toContain('rootMissionNotificationScheduler');
    expect(source).toContain('cancelNotifications: async () =>');
    expect(source).toContain('rootMissionNotificationScheduler.cancelAll()');
  });
});

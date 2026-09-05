import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('MTS-035 authenticated app entry', () => {
  it('keeps the protected Expo Router stack behind the authentication gate', async () => {
    const rootLayout = await readFile(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');

    expect(rootLayout).toContain("from '../src/auth/auth-gate.js'");
    expect(rootLayout).toMatch(/<AuthGate[\s\S]*<Stack[\s\S]*<\/Stack>[\s\S]*<\/AuthGate>/);
  });
});

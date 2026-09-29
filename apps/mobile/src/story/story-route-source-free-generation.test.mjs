import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const storyRoutePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));

describe('MTS-109 cross-ticket source-free Story regeneration', () => {
  it('allows remaining AI generations when the draft has no evidence source version', async () => {
    const source = await readFile(storyRoutePath, 'utf8');

    expect(source).not.toContain('source === null ||');
    expect(source).toContain('source?.id');
  });
});

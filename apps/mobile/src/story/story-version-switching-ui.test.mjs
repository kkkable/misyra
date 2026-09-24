import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));
const editorPath = fileURLToPath(new URL('./story-editor-screen.tsx', import.meta.url));

describe('MTS-095 Story version switching UI contract', () => {
  it('renders a version selector with generated-only deletion', () => {
    const editor = readFileSync(editorPath, 'utf8');

    expect(editor).toMatch(/selectedImageVersionId/);
    expect(editor).toMatch(/onSelectImageVersion/);
    expect(editor).toMatch(/story-version-/);
    expect(editor).toMatch(/onDeleteImageVersion/);
    expect(editor).toMatch(/story-delete-version-/);
  });

  it('switches retained versions without calling image generation', () => {
    const route = readFileSync(routePath, 'utf8');

    expect(route).toMatch(/switchStoryImageVersion/);
    expect(route).toMatch(/onSelectImageVersion/);
    expect(route).toMatch(/onGenerateVersion/);
    expect(route).toMatch(/imageGeneration\.generate/);
  });
});

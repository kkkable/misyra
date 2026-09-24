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
    const selectStart = route.indexOf('onSelectImageVersion=');
    const generateStart = route.indexOf('onGenerateVersion=', selectStart);
    const selectHandler = route.slice(selectStart, generateStart);

    expect(selectStart).toBeGreaterThanOrEqual(0);
    expect(generateStart).toBeGreaterThan(selectStart);
    expect(selectHandler).toMatch(/switchStoryImageVersion/);
    expect(selectHandler).not.toMatch(/imageGeneration\.generate/);

    const generateHandler = route.slice(generateStart, route.indexOf('onDeleteImageVersion=', generateStart));
    expect(generateHandler).toMatch(/imageGeneration\.generate/);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));
const editorPath = fileURLToPath(new URL('./story-editor-screen.tsx', import.meta.url));
const panelPath = fileURLToPath(new URL('./story-text-suggestions-panel.tsx', import.meta.url));

describe('MTS-092 production Story suggestion integration', () => {
  it('requests initial suggestions only for a newly created Story and persists Sharing Notes', () => {
    const route = readFileSync(routePath, 'utf8');

    expect(route).toMatch(/createStoryTextSuggestionsApi/);
    expect(route).toMatch(/textSuggestions\s*\.suggest\(occurrenceId\)/);
    expect(route).toMatch(/notes:\s*suggestions\.sharingNotes/);
    expect(route).toMatch(/enqueueSave\(next\.payload\)/);
  });

  it('shows suggestions before placement and resolves only after an explicit choice', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');
    const panel = readFileSync(panelPath, 'utf8');

    expect(route).toMatch(/textSuggestions=/);
    expect(editor).toMatch(/StoryTextSuggestionsPanel/);
    expect(editor).toMatch(/applyStoryTextSuggestionSelection/);
    expect(panel).toMatch(/story-suggestion-photo-only/);
    expect(route).not.toMatch(/feedCaption|feed-caption/i);
  });
});

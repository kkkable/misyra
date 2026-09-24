import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));
const editorPath = fileURLToPath(new URL('./story-editor-screen.tsx', import.meta.url));
const offlineStorePath = fileURLToPath(new URL('./story-offline-draft.ts', import.meta.url));
const sourceRuntimePath = fileURLToPath(new URL('./story-source-runtime.ts', import.meta.url));

describe('MTS-091 production Story route contract', () => {
  it('restores local drafts and queues autosaves without requiring online Story generation', () => {
    const route = readFileSync(routePath, 'utf8');

    expect(route).toMatch(/useLocalSearchParams/);
    expect(route).toMatch(/createStoryOfflineDraftStore/);
    expect(route).toMatch(/\.load\(occurrenceId\)/);
    expect(route).toMatch(/\.save\(occurrenceId/);
    expect(route).toMatch(/onCompositionChange/);
    expect(route).not.toMatch(/planner|AI Story/i);
  });

  it('materializes selected evidence into Story working storage and keeps editor history session-local', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');
    const sourceRuntime = readFileSync(sourceRuntimePath, 'utf8');

    expect(route).toMatch(/createStorySourceRuntime/);
    expect(route).toMatch(/list\(occurrenceId\)/);
    expect(route).toMatch(/materialize\(/);
    expect(sourceRuntime).toMatch(/copyOriginalToStoryWorking/);
    expect(editor).toMatch(/createStoryEditorSession/);
    expect(editor).toMatch(/sourceImageId/);
    expect(editor).toMatch(/sourceImage\.id/);
  });

  it('uses the shared Story-save haptic and contains no excluded media/sticker editing', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');
    const offlineStore = readFileSync(offlineStorePath, 'utf8');

    expect(route).toMatch(/haptics\.triggerNonBlocking\('storySave'\)/);
    expect(route).toMatch(/localizationCatalogs/);
    expect(offlineStore).toMatch(/entityType:\s*'story'/);

    for (const forbidden of [/video/i, /music editing/i, /sticker/i, /GIF/i]) {
      expect(editor).not.toMatch(forbidden);
      expect(route).not.toMatch(forbidden);
    }
  });
});

describe('MTS-096 Story offline conflict route contract', () => {
  it('queues local saves for root sync and reloads active conflicts with the approved message', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');

    expect(route).toMatch(/rootSyncRuntime\.run\(\)/);
    expect(route).toMatch(/storyConflictSettlementChannel\.subscribe/);
    expect(route).toMatch(/sync\.conflict\.storyUpdated/);
    expect(route).toMatch(/conflictMessage=\{conflictMessage\}/);
    expect(route).toMatch(/editorSessionEpoch/);
    expect(editor).toMatch(/story-conflict-message/);
    expect(editor).toMatch(/editorSessionEpoch/);
  });

  it('passes explicit offline AI availability to the editor generation control', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');

    expect(route).toMatch(/networkAvailabilityChannel\.subscribe/);
    expect(route).toMatch(/availability === 'unavailable'/);
    expect(route).toMatch(/runtime\.imageGeneration[\s\S]{0,120}\.getBudget/);
    expect(route.match(/aiOperationsAvailable: false/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(route).toMatch(
      /remainingGenerations: budget\.remainingGenerations,[\s\S]{0,100}aiOperationsAvailable: true/,
    );
    expect(editor).toMatch(/disabled=\{!aiOperationsAvailable\}/);
  });
});

describe('MTS-094 Story generation route contract', () => {
  it('loads the authoritative generation budget for the active Story draft', () => {
    const route = readFileSync(routePath, 'utf8');
    expect(route).toMatch(/createStoryImageGenerationApi/);
    expect(route).toMatch(/getBudget\(/);
    expect(route).toMatch(/remainingGenerations/);
  });
});


describe('MTS-098 Instagram handoff route contract', () => {
  it('wires persisted draft Sharing Notes to copy/open actions before external handoff', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');

    expect(route).toMatch(/payload\.notes/);
    expect(route).toMatch(/onCopySharingNote/);
    expect(route).toMatch(/onOpenInstagram/);
    expect(editor).toMatch(/story-open-instagram/);
    expect(editor).toMatch(/story-sharing-notes-open/);
    expect(editor).toMatch(/story-copy-musicMood/);
    expect(editor).toMatch(/story-copy-mention/);
    expect(editor).toMatch(/story-copy-location/);
    expect(editor).toMatch(/story-copy-poll/);
  });

  it('contains no posting confirmation, status tracking, or native Instagram sticker placement', () => {
    const route = readFileSync(routePath, 'utf8');
    const editor = readFileSync(editorPath, 'utf8');
    const combined = `${route}\n${editor}`;

    expect(combined).not.toMatch(/did you post/i);
    expect(combined).not.toMatch(/post(?:ing|ed)?Status|post_status|posting_status/i);
    expect(combined).not.toMatch(/nativeSticker|musicSticker|pollSticker|locationSticker/i);
  });
});

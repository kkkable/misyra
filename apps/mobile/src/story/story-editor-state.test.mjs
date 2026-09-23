import { describe, expect, it } from 'vitest';

import { createStoryEditorSession } from './story-editor-state.ts';

const sourceImage = Object.freeze({
  id: 'source-1',
  uri: 'file:///story/source-1.jpg',
  width: 3024,
  height: 4032,
});

describe('MTS-091 source Story editor session', () => {
  it('edits source composition without mutating the original evidence reference', () => {
    const originalSource = { ...sourceImage };
    const session = createStoryEditorSession({
      sourceImage,
      savedComposition: null,
      now: () => '2026-09-23T05:45:00.000Z',
    });

    session.transformBackground({
      scale: 1.35,
      translateX: 96,
      translateY: -128,
      rotation: 0,
    });
    session.setHeadline({
      text: 'Finished',
      x: 124,
      y: 280,
      width: 720,
      fontSize: 82,
      fontCategory: 'system-bold',
      color: '#FFFFFF',
    });
    session.setEffect({ kind: 'contrast', amount: 0.2 });

    expect(sourceImage).toEqual(originalSource);
    expect(session.getComposition()).toMatchObject({
      canvas: { width: 1080, height: 1920 },
      background: {
        scale: 1.35,
        translateX: 96,
        translateY: -128,
        rotation: 0,
      },
      headline: {
        text: 'Finished',
        x: 124,
        y: 280,
        width: 720,
        fontSize: 82,
        fontCategory: 'system-bold',
        color: '#FFFFFF',
      },
      supportingText: null,
      effects: [{ kind: 'contrast', amount: 0.2 }],
      revision: 3,
      savedAt: '2026-09-23T05:45:00.000Z',
    });
  });

  it('keeps undo/redo session-local and starts a reopened draft with an empty edit stack', () => {
    const first = createStoryEditorSession({
      sourceImage,
      savedComposition: null,
      now: () => '2026-09-23T05:46:00.000Z',
    });

    first.transformBackground({
      scale: 1.2,
      translateX: 40,
      translateY: -20,
      rotation: 0,
    });
    first.setSupportingText({
      text: 'One step at a time',
      x: 128,
      y: 1450,
      width: 824,
      fontSize: 44,
      fontCategory: 'system',
      color: '#FFFFFF',
    });

    expect(first.canUndo()).toBe(true);
    expect(first.canRedo()).toBe(false);

    first.undo();
    expect(first.getComposition().supportingText).toBeNull();
    expect(first.canRedo()).toBe(true);

    first.redo();
    const saved = first.getComposition();
    expect(saved.supportingText?.text).toBe('One step at a time');

    const reopened = createStoryEditorSession({
      sourceImage,
      savedComposition: saved,
      now: () => '2026-09-23T05:47:00.000Z',
    });

    expect(reopened.getComposition()).toEqual(saved);
    expect(reopened.canUndo()).toBe(false);
    expect(reopened.canRedo()).toBe(false);
  });
});

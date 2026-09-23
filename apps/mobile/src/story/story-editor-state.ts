import {
  cloneStoryComposition,
  createEmptyStoryComposition,
  validateStoryComposition,
  type StoryBackgroundTransform,
  type StoryComposition,
  type StoryEffect,
  type StoryTextLayer,
} from './story-composition.js';

export type StorySourceImage = Readonly<{
  id: string;
  uri: string;
  width: number;
  height: number;
}>;

type StoryEditorSessionOptions = Readonly<{
  sourceImage: StorySourceImage;
  savedComposition: StoryComposition | null;
  now?: () => string;
}>;

function validateSourceImage(source: StorySourceImage): StorySourceImage {
  if (source.id.trim().length === 0 || source.uri.trim().length === 0) {
    throw new TypeError('Story source image id and uri must not be empty.');
  }
  if (
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    throw new RangeError('Story source image dimensions must be positive.');
  }
  return Object.freeze({ ...source });
}

export function createStoryEditorSession({
  sourceImage,
  savedComposition,
  now = () => new Date().toISOString(),
}: StoryEditorSessionOptions) {
  const source = validateSourceImage(sourceImage);
  let current =
    savedComposition === null
      ? createEmptyStoryComposition(now())
      : cloneStoryComposition(validateStoryComposition(savedComposition));
  const undoHistory: StoryComposition[] = [];
  const redoHistory: StoryComposition[] = [];

  const stamped = (visual: StoryComposition): StoryComposition =>
    validateStoryComposition({
      ...visual,
      revision: current.revision + 1,
      savedAt: now(),
    });

  const commit = (next: StoryComposition): void => {
    undoHistory.push(current);
    current = stamped(next);
    redoHistory.length = 0;
  };

  return Object.freeze({
    getSourceImage(): StorySourceImage {
      return source;
    },

    getComposition(): StoryComposition {
      return cloneStoryComposition(current);
    },

    canUndo(): boolean {
      return undoHistory.length > 0;
    },

    canRedo(): boolean {
      return redoHistory.length > 0;
    },

    applyComposition(composition: StoryComposition): void {
      undoHistory.push(current);
      current = cloneStoryComposition(validateStoryComposition(composition));
      redoHistory.length = 0;
    },

    transformBackground(background: StoryBackgroundTransform): void {
      commit(validateStoryComposition({ ...current, background }));
    },

    setHeadline(headline: StoryTextLayer | null): void {
      commit(validateStoryComposition({ ...current, headline }));
    },

    setSupportingText(supportingText: StoryTextLayer | null): void {
      commit(validateStoryComposition({ ...current, supportingText }));
    },

    setEffect(nextEffect: StoryEffect): void {
      const existingIndex = current.effects.findIndex((item) => item.kind === nextEffect.kind);
      const effects =
        existingIndex < 0
          ? [...current.effects, nextEffect]
          : current.effects.map((item, index) => (index === existingIndex ? nextEffect : item));
      commit(validateStoryComposition({ ...current, effects }));
    },

    removeEffect(kind: string): void {
      const effects = current.effects.filter((item) => item.kind !== kind);
      if (effects.length === current.effects.length) return;
      commit(validateStoryComposition({ ...current, effects }));
    },

    undo(): boolean {
      const previous = undoHistory.pop();
      if (previous === undefined) return false;
      redoHistory.push(current);
      current = stamped(previous);
      return true;
    },

    redo(): boolean {
      const next = redoHistory.pop();
      if (next === undefined) return false;
      undoHistory.push(current);
      current = stamped(next);
      return true;
    },
  });
}

export type StoryEditorSession = ReturnType<typeof createStoryEditorSession>;

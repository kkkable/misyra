import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  const Pressable = ({ children, ...props }) =>
    h('Pressable', props, typeof children === 'function' ? children({ pressed: false }) : children);
  return {
    Pressable,
    ScrollView: ({ children, ...props }) => h('ScrollView', props, children),
    StyleSheet: { create: (value) => value },
    Text: ({ children, ...props }) => h('Text', props, children),
    TextInput: (props) => h('TextInput', props),
    View: ({ children, ...props }) => h('View', props, children),
    useWindowDimensions: () => ({ width: 392, height: 844 }),
  };
});

vi.mock('../design-system/index.js', async () => {
  const { createElement: h } = await import('react');
  const button =
    (name) =>
    ({ label, ...props }) =>
      h(name, props, label);
  return {
    PrimaryButton: button('PrimaryButton'),
    SecondaryButton: button('SecondaryButton'),
    Screen: ({ children, ...props }) => h('Screen', props, children),
    TextField: ({ label, ...props }) => h('TextField', props, label),
    TopBar: ({ leading, title, trailing, ...props }) =>
      h('TopBar', props, leading, title, trailing),
    themeColors: () => ({
      canvas: '#fff',
      border: '#ddd',
      primary: '#6D3CF3',
      primarySoft: '#eee',
      textPrimary: '#111',
      textSecondary: '#666',
    }),
  };
});

vi.mock('./story-skia-preview-view.js', async () => {
  const { createElement: h } = await import('react');
  return {
    StorySkiaPreviewView: (props) => h('StorySkiaPreviewView', props),
  };
});

import { StoryEditorScreen } from './story-editor-screen.tsx';

const messages = {
  title: 'Story',
  close: 'Close',
  save: 'Save',
  source: 'Source photo',
  sourcePhoto: 'Photo {number}',
  undo: 'Undo',
  redo: 'Redo',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  moveLeft: 'Left',
  moveRight: 'Right',
  moveUp: 'Up',
  moveDown: 'Down',
  headline: 'Headline',
  supportingText: 'Supporting text',
  editHeadline: 'Edit headline',
  editSupportingText: 'Edit supporting text',
  textSmaller: 'Text smaller',
  textLarger: 'Text larger',
  textColor: 'Text colour',
  font: 'Font',
  removeText: 'Remove text',
  contrast: 'Contrast',
  remainingGenerations: '{count} AI generations remaining',
};

const sourceAttempts = [
  {
    attemptId: 'attempt-1',
    attemptNumber: 1,
    effectiveSubmittedAt: '2026-09-23T06:00:00.000Z',
    verificationStatus: 'rejected',
  },
  {
    attemptId: 'attempt-2',
    attemptNumber: 2,
    effectiveSubmittedAt: '2026-09-23T06:10:00.000Z',
    verificationStatus: 'accepted',
  },
];

const sourceImage = {
  id: 'source-version',
  uri: 'file:///story/source.jpg',
  width: 3024,
  height: 4032,
};

const composition = {
  canvas: { width: 1080, height: 1920 },
  background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
  headline: null,
  supportingText: null,
  effects: [],
  revision: 0,
  savedAt: '2026-09-23T07:00:00.000Z',
};

function renderScreen(overrides = {}) {
  const props = {
    colorScheme: 'light',
    composition,
    messages,
    onClose: vi.fn(),
    onCompositionChange: vi.fn(),
    onSave: vi.fn(),
    onSelectSource: vi.fn(),
    selectedAttemptId: 'attempt-1',
    remainingGenerations: 3,
    sourceAttempts,
    sourceImage,
    ...overrides,
  };
  let renderer;
  act(() => {
    renderer = create(createElement(StoryEditorScreen, props));
  });
  return { renderer, props };
}

describe('MTS-091 Story editor interactions', () => {
  it('selects a source and edits crop/zoom/position/effect with session undo and redo', () => {
    const { renderer, props } = renderScreen();

    act(() => renderer.root.findByProps({ testID: 'story-source-attempt-2' }).props.onPress());
    expect(props.onSelectSource).toHaveBeenCalledWith(sourceAttempts[1]);

    act(() => renderer.root.findByProps({ testID: 'story-zoom-in' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-move-right' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-contrast' }).props.onPress());

    let preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.background).toMatchObject({ scale: 1.1, translateX: 40 });
    expect(preview.props.composition.effects).toEqual([{ kind: 'contrast', amount: 0.1 }]);

    act(() => renderer.root.findByProps({ testID: 'story-undo' }).props.onPress());
    preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.effects).toEqual([]);

    act(() => renderer.root.findByProps({ testID: 'story-redo' }).props.onPress());
    preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.effects).toEqual([{ kind: 'contrast', amount: 0.1 }]);
  });

  it('preserves the current-session undo stack when autosave returns a newer composition prop', () => {
    const { renderer, props } = renderScreen();

    act(() => renderer.root.findByProps({ testID: 'story-zoom-in' }).props.onPress());
    const autosaved = props.onCompositionChange.mock.calls.at(-1)?.[0];
    expect(autosaved.background.scale).toBe(1.1);

    act(() => {
      renderer.update(
        createElement(StoryEditorScreen, {
          ...props,
          composition: autosaved,
        }),
      );
    });

    expect(renderer.root.findByProps({ testID: 'story-undo' }).props.disabled).toBe(false);
    act(() => renderer.root.findByProps({ testID: 'story-undo' }).props.onPress());

    const preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.background.scale).toBe(1);
  });

  it('places explicit text suggestions into the current undoable editor session', () => {
    const onTextSuggestionsResolved = vi.fn();
    const { renderer } = renderScreen({
      textSuggestions: {
        headline: 'Done before dinner',
        supportingText: 'A steady 5K after work.',
        sharingNotes: {
          musicMood: 'upbeat',
          mention: null,
          location: null,
          poll: null,
        },
      },
      textSuggestionMessages: {
        title: 'Suggestions',
        useHeadline: 'Use headline',
        useSupportingText: 'Use supporting text',
        useBoth: 'Use both',
        photoOnly: 'Photo only',
        sharingNotes: 'Sharing Notes',
        musicMood: 'Music / mood',
        mention: 'Mention',
        location: 'Location',
        poll: 'Poll',
      },
      onTextSuggestionsResolved,
    });

    act(() => renderer.root.findByProps({ testID: 'story-suggestion-use-both' }).props.onPress());

    let preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.headline?.text).toBe('Done before dinner');
    expect(preview.props.composition.supportingText?.text).toBe('A steady 5K after work.');
    expect(onTextSuggestionsResolved).toHaveBeenCalledTimes(1);

    act(() => renderer.root.findByProps({ testID: 'story-undo' }).props.onPress());
    preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.headline).toBeNull();
    expect(preview.props.composition.supportingText).toBeNull();
  });

  it('edits, moves, resizes, recolours, changes font and removes optional text layers', () => {
    const { renderer, props } = renderScreen();

    act(() =>
      renderer.root
        .findByProps({ testID: 'story-headline-input' })
        .props.onChangeText('Mission complete'),
    );
    act(() => renderer.root.findByProps({ testID: 'story-text-larger' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-text-color' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-font' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-text-right' }).props.onPress());

    let preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.headline).toMatchObject({
      text: 'Mission complete',
      x: 160,
      fontSize: 80,
      color: '#111111',
      fontCategory: 'system',
    });

    act(() => renderer.root.findByProps({ testID: 'story-remove-text' }).props.onPress());
    preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.headline).toBeNull();

    act(() => renderer.root.findByProps({ testID: 'story-save' }).props.onPress());
    expect(props.onSave).toHaveBeenCalledWith(preview.props.composition);
  });
});

describe('MTS-094 Story generation budget surface', () => {
  it('shows the remaining AI generation count in the editor', () => {
    const { renderer } = renderScreen({ remainingGenerations: 2 });
    const remaining = renderer.root.findByProps({ testID: 'story-generation-remaining' });
    expect(remaining.props.children).toBe('2 AI generations remaining');
  });
});

describe('MTS-095 per-version switching surface', () => {
  const imageVersions = [
    { id: 'source-version', kind: 'source' },
    { id: 'generated-one', kind: 'generated' },
    { id: 'generated-two', kind: 'generated' },
  ];

  it('switches to a retained generated version without requesting another AI generation', () => {
    const onSelectImageVersion = vi.fn();
    const onGenerateVersion = vi.fn();
    const { renderer } = renderScreen({
      imageVersions,
      selectedImageVersionId: 'source-version',
      onSelectImageVersion,
      onGenerateVersion,
    });

    act(() =>
      renderer.root.findByProps({ testID: 'story-version-generated-one' }).props.onPress(),
    );

    expect(onSelectImageVersion).toHaveBeenCalledWith('generated-one');
    expect(onGenerateVersion).not.toHaveBeenCalled();
  });

  it('offers deletion only for generated versions', () => {
    const onDeleteImageVersion = vi.fn();
    const { renderer } = renderScreen({
      imageVersions,
      selectedImageVersionId: 'generated-one',
      onSelectImageVersion: vi.fn(),
      onDeleteImageVersion,
      onGenerateVersion: vi.fn(),
    });

    expect(() =>
      renderer.root.findByProps({ testID: 'story-delete-version-source-version' }),
    ).toThrow();

    act(() =>
      renderer.root.findByProps({ testID: 'story-delete-version-generated-one' }).props.onPress(),
    );
    expect(onDeleteImageVersion).toHaveBeenCalledWith('generated-one');
  });
});

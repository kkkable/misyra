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
    Toast: ({ message, ...props }) => h('Toast', props, message),
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
  versions: 'Versions',
  versionSource: 'Source',
  versionGenerated: 'AI {number}',
  generateVersion: 'Generate AI version',
  deleteVersion: 'Delete version',
  saveToPhotos: 'Save to Photos',
  shareElsewhere: 'Share elsewhere',
  savedToPhotos: 'Saved to Photos.',
  openInstagram: 'Open Instagram',
  sharingNotes: 'Sharing Notes',
  copy: 'Copy',
  continueToInstagram: 'Continue to Instagram',
  musicMood: 'Music / mood',
  mention: 'Mention',
  location: 'Location',
  poll: 'Poll',
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

describe('MTS-096 Story offline and conflict editor behavior', () => {
  it('shows the approved non-blocking conflict message when another device wins', () => {
    const approved = 'This Story draft was updated on another device.';
    const { renderer } = renderScreen({ conflictMessage: approved });

    const notice = renderer.root.findByProps({ testID: 'story-conflict-message' });
    expect(notice.props.message).toBe(approved);
  });

  it('disables AI generation while offline without blocking manual edits', () => {
    const onGenerateVersion = vi.fn();
    const { renderer } = renderScreen({
      aiOperationsAvailable: false,
      onGenerateVersion,
    });

    const generate = renderer.root.findByProps({ testID: 'story-generate-version' });
    expect(generate.props.disabled).toBe(true);

    act(() => renderer.root.findByProps({ testID: 'story-zoom-in' }).props.onPress());
    const preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition.background.scale).toBe(1.1);
    expect(onGenerateVersion).not.toHaveBeenCalled();
  });

  it('reloads authoritative composition and clears undo/redo after a losing conflict', () => {
    const { renderer, props } = renderScreen({ editorSessionEpoch: 0 });

    act(() => renderer.root.findByProps({ testID: 'story-zoom-in' }).props.onPress());
    expect(renderer.root.findByProps({ testID: 'story-undo' }).props.disabled).toBe(false);

    const authoritative = {
      ...composition,
      background: { ...composition.background, scale: 1.7, translateX: 160 },
      revision: 7,
      savedAt: '2026-09-24T10:15:00.000Z',
    };
    act(() => {
      renderer.update(
        createElement(StoryEditorScreen, {
          ...props,
          composition: authoritative,
          editorSessionEpoch: 1,
        }),
      );
    });

    const preview = renderer.root.findByType('StorySkiaPreviewView');
    expect(preview.props.composition).toEqual(authoritative);
    expect(renderer.root.findByProps({ testID: 'story-undo' }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'story-redo' }).props.disabled).toBe(true);
  });
});

describe('MTS-095 Story version selector interactions', () => {
  const imageVersions = [
    { id: 'source-version', kind: 'source' },
    { id: 'generated-one', kind: 'generated' },
  ];

  it('switches to a retained version without invoking AI generation', () => {
    const onSelectImageVersion = vi.fn();
    const onGenerateVersion = vi.fn();
    const { renderer } = renderScreen({
      imageVersions,
      selectedImageVersionId: 'source-version',
      onSelectImageVersion,
      onGenerateVersion,
    });

    act(() => renderer.root.findByProps({ testID: 'story-version-generated-one' }).props.onPress());

    expect(onSelectImageVersion).toHaveBeenCalledTimes(1);
    expect(onSelectImageVersion).toHaveBeenCalledWith('generated-one');
    expect(onGenerateVersion).not.toHaveBeenCalled();
  });

  it('does not expose a delete action for Source', () => {
    const { renderer } = renderScreen({
      imageVersions,
      selectedImageVersionId: 'source-version',
      onSelectImageVersion: vi.fn(),
      onDeleteImageVersion: vi.fn(),
      onGenerateVersion: vi.fn(),
    });

    expect(() =>
      renderer.root.findByProps({ testID: 'story-delete-version-source-version' }),
    ).toThrow();
    expect(
      renderer.root.findByProps({ testID: 'story-delete-version-generated-one' }),
    ).toBeDefined();
  });
});

describe('MTS-097 Story export actions', () => {
  it('invokes direct save/share actions and shows the approved saved confirmation', () => {
    const onSaveToPhotos = vi.fn();
    const onShareElsewhere = vi.fn();
    const { renderer } = renderScreen({
      onSaveToPhotos,
      onShareElsewhere,
      savedToPhotosMessage: 'Saved to Photos.',
    });

    act(() => renderer.root.findByProps({ testID: 'story-save-to-photos' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'story-share-elsewhere' }).props.onPress());

    expect(onSaveToPhotos).toHaveBeenCalledTimes(1);
    expect(onShareElsewhere).toHaveBeenCalledTimes(1);
    const notice = renderer.root.findByProps({ testID: 'story-saved-to-photos' });
    expect(notice.props.message).toBe('Saved to Photos.');
  });
});

function pressByTestId(renderer, testID) {
  act(() => renderer.root.findByProps({ testID }).props.onPress());
}

describe('MTS-098 Instagram Sharing Notes flow', () => {
  const sharingNotes = {
    musicMood: 'upbeat running track',
    mention: '@misyra',
    location: 'Hong Kong',
    poll: {
      question: 'Run again tomorrow?',
      options: ['Yes', 'Maybe later'],
    },
  };

  it('shows Sharing Notes before Instagram opens and supports copy actions', () => {
    const onCopySharingNote = vi.fn();
    const onOpenInstagram = vi.fn();
    const { renderer } = renderScreen({
      sharingNotes,
      onCopySharingNote,
      onOpenInstagram,
    });

    pressByTestId(renderer, 'story-open-instagram');

    expect(onOpenInstagram).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'story-sharing-notes' })).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: 'story-sharing-note-musicMood' }).props.children,
    ).toContain('upbeat running track');
    expect(
      renderer.root.findByProps({ testID: 'story-sharing-note-mention' }).props.children,
    ).toContain('@misyra');
    expect(
      renderer.root.findByProps({ testID: 'story-sharing-note-location' }).props.children,
    ).toContain('Hong Kong');
    expect(
      renderer.root.findByProps({ testID: 'story-sharing-note-poll' }).props.children,
    ).toContain('Run again tomorrow?');

    pressByTestId(renderer, 'story-copy-musicMood');
    pressByTestId(renderer, 'story-copy-mention');
    pressByTestId(renderer, 'story-copy-location');
    pressByTestId(renderer, 'story-copy-poll');

    expect(onCopySharingNote).toHaveBeenNthCalledWith(1, 'upbeat running track');
    expect(onCopySharingNote).toHaveBeenNthCalledWith(2, '@misyra');
    expect(onCopySharingNote).toHaveBeenNthCalledWith(3, 'Hong Kong');
    expect(onCopySharingNote).toHaveBeenNthCalledWith(
      4,
      'Run again tomorrow? — Yes / Maybe later',
    );

    pressByTestId(renderer, 'story-sharing-notes-open');
    expect(onOpenInstagram).toHaveBeenCalledTimes(1);
  });

  it('never exposes a posting-confirmation or post-status control', () => {
    const { renderer } = renderScreen({
      sharingNotes,
      onCopySharingNote: vi.fn(),
      onOpenInstagram: vi.fn(),
    });

    const ids = renderer.root
      .findAll((node) => typeof node.props.testID === 'string')
      .map((node) => node.props.testID);

    const hasPostTracking = ids.some((id) =>
      /did-you-post|post-status|posted-status/i.test(id),
    );
    expect(hasPostTracking).toBe(false);
  });
});

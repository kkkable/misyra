import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  const ScrollView = ({ children, ...props }) => {
    return createReactElement('ScrollView', props, children);
  };
  const TextInput = (props) => createReactElement('TextInput', props);
  return {
    Image: 'Image',
    Pressable,
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    TextInput,
    View: 'View',
    useColorScheme: () => 'light',
  };
});

vi.mock('../accessibility/system-text.js', () => ({ SystemText: 'Text' }));

vi.mock('../design-system/index.js', async () => {
  const { createElement: createReactElement } = await import('react');
  const button = (name) => {
    return ({ children, ...props }) => createReactElement(name, props, children);
  };
  return {
    PrimaryButton: button('PrimaryButton'),
    SecondaryButton: button('SecondaryButton'),
    Screen: ({ children, ...props }) => createReactElement('Screen', props, children),
    TopBar: (props) => createReactElement('TopBar', props),
    themeColors: () => ({
      border: '#000',
      destructive: '#000',
      primary: '#000',
      primarySoft: '#000',
      surface: '#000',
      surfaceMuted: '#000',
      textPrimary: '#000',
      textSecondary: '#000',
      textTertiary: '#000',
    }),
  };
});

import { FeedbackFormScreen } from './feedback-form-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MTS-106 feedback form interaction', () => {
  it('previews content, submits once, and shows success', async () => {
    const onSubmit = vi.fn(async () => undefined);
    let renderer;
    act(() => {
      renderer = create(
        createElement(FeedbackFormScreen, {
          initialCategory: 'feedback',
          language: 'en',
          now: () => new Date('2026-09-28T07:20:00.000Z'),
          onDone: vi.fn(),
          onPickScreenshot: vi.fn(async () => null),
          onSubmit,
          technicalDetails: {
            appVersion: '1.2.3',
            screenName: 'feedback',
          },
        }),
      );
    });

    const description = renderer.root.findByProps({ testID: 'feedback-description' });
    act(() => {
      description.props.onChangeText('Calendar feedback');
    });

    const preview = renderer.root.findByProps({ testID: 'feedback-preview-action' });
    act(() => {
      preview.props.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'feedback-preview' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'feedback-technical-summary' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'feedback-retention-disclosure' })).toBeDefined();

    const submit = renderer.root.findByProps({ testID: 'feedback-submit' });
    await act(async () => {
      submit.props.onPress();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'feedback',
        description: 'Calendar feedback',
        email: null,
        screenshot: null,
        technicalDetails: expect.objectContaining({
          appVersion: '1.2.3',
          screenName: 'feedback',
          submissionTimestamp: '2026-09-28T07:20:00.000Z',
        }),
      }),
    );
    expect(renderer.root.findByProps({ testID: 'feedback-success' })).toBeDefined();
  });

  it('persists a replacement screenshot before removing the previous working file', async () => {
    let releaseDraftSave;
    const draftSave = new Promise((resolve) => {
      releaseDraftSave = resolve;
    });
    const onDraftChange = vi.fn(() => draftSave);
    const onRemoveScreenshot = vi.fn(async () => undefined);
    const oldScreenshot = {
      uri: 'file:///old.png',
      mimeType: 'image/png',
      sizeBytes: 10,
    };
    const newScreenshot = {
      uri: 'file:///new.png',
      mimeType: 'image/png',
      sizeBytes: 20,
    };

    let renderer;
    act(() => {
      renderer = create(
        createElement(FeedbackFormScreen, {
          initialCategory: 'feedback',
          initialDraft: {
            category: 'feedback',
            description: 'Saved draft',
            email: '',
            screenshot: oldScreenshot,
          },
          language: 'en',
          onDone: vi.fn(),
          onDraftChange,
          onPickScreenshot: vi.fn(async () => newScreenshot),
          onRemoveScreenshot,
          onSubmit: vi.fn(async () => undefined),
          technicalDetails: { screenName: 'feedback' },
        }),
      );
    });

    const replace = renderer.root.findByProps({ testID: 'feedback-screenshot-replace' });
    let replacement;
    await act(async () => {
      replacement = replace.props.onPress();
      await Promise.resolve();
    });

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ screenshot: newScreenshot }),
    );
    expect(onRemoveScreenshot).not.toHaveBeenCalled();

    releaseDraftSave();
    await act(async () => {
      await replacement;
      await Promise.resolve();
    });

    expect(onRemoveScreenshot).toHaveBeenCalledWith(oldScreenshot);
  });
});

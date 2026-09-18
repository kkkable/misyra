import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  return {
    Image: (props) => h('Image', props),
    Pressable: ({ children, ...props }) => h('Pressable', props, children),
    StyleSheet: { create: (value) => value, absoluteFillObject: {} },
    Text: ({ children, ...props }) => h('Text', props, children),
    View: ({ children, ...props }) => h('View', props, children),
  };
});

import { EvidenceCaptureScreen } from './evidence-capture-screen.js';

const messages = {
  close: 'Close',
  permissionTitle: 'Camera access is required',
  permissionBody: 'Use the camera to capture evidence for this mission.',
  openSettings: 'Open Settings',
  capture: 'Take photo',
  retake: 'Retake',
  submit: 'Submit Evidence',
  captureFailed: 'Could not capture evidence. Try again.',
};

function harness(permissionStatus = 'granted') {
  const Preview = ({ active }) => createElement('CameraPreview', { active });
  const runtime = {
    permission: {
      getStatus: vi.fn(() => Promise.resolve(permissionStatus)),
      request: vi.fn(() => Promise.resolve(permissionStatus)),
      openSettings: vi.fn(() => Promise.resolve()),
    },
    camera: {
      Preview,
      capture: vi.fn(() => Promise.resolve({ uri: 'file:///cache/captured-original.jpg' })),
    },
    files: {
      protectOriginal: vi.fn(() =>
        Promise.resolve({ uri: 'file:///documents/misyra/evidence-working/original.jpg' }),
      ),
      discard: vi.fn(() => Promise.resolve()),
    },
  };
  return runtime;
}

async function renderScreen(runtime, onSubmit = vi.fn(), onClose = vi.fn()) {
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(EvidenceCaptureScreen, {
        runtime,
        messages,
        onClose,
        onSubmit,
      }),
    );
  });
  return { renderer, onSubmit, onClose };
}

describe('MTS-079 evidence camera permission timing', () => {
  it('requests permission only when the evidence flow is actually mounted', async () => {
    const runtime = harness('undetermined');
    runtime.permission.request.mockResolvedValue('granted');

    expect(runtime.permission.getStatus).not.toHaveBeenCalled();
    expect(runtime.permission.request).not.toHaveBeenCalled();

    const { renderer } = await renderScreen(runtime);

    expect(runtime.permission.getStatus).toHaveBeenCalledTimes(1);
    expect(runtime.permission.request).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('CameraPreview')).toHaveLength(1);
  });

  it('does not re-prompt an already denied user and provides a recoverable Settings action', async () => {
    const runtime = harness('denied');
    const { renderer } = await renderScreen(runtime);

    expect(runtime.permission.request).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('CameraPreview')).toHaveLength(0);
    const settings = renderer.root.findByProps({ testID: 'evidence-open-settings' });

    await act(async () => {
      settings.props.onPress();
    });

    expect(runtime.permission.openSettings).toHaveBeenCalledTimes(1);
  });
});

describe('MTS-079 camera-only capture and review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures into a protected working copy and Retake consumes no submission attempt', async () => {
    const runtime = harness();
    const { renderer, onSubmit } = await renderScreen(runtime);

    const capture = renderer.root.findByProps({ testID: 'evidence-capture' });
    await act(async () => {
      await capture.props.onPress();
    });

    expect(runtime.camera.capture).toHaveBeenCalledTimes(1);
    expect(runtime.files.protectOriginal).toHaveBeenCalledWith(
      'file:///cache/captured-original.jpg',
    );
    expect(renderer.root.findByType('Image').props.source).toEqual({
      uri: 'file:///documents/misyra/evidence-working/original.jpg',
    });

    const retake = renderer.root.findByProps({ testID: 'evidence-retake' });
    await act(async () => {
      await retake.props.onPress();
    });

    expect(runtime.files.discard).toHaveBeenCalledWith(
      'file:///documents/misyra/evidence-working/original.jpg',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('CameraPreview')).toHaveLength(1);
  });

  it('submits the immutable protected original without editing or transforming it', async () => {
    const runtime = harness();
    const { renderer, onSubmit } = await renderScreen(runtime);

    await act(async () => {
      await renderer.root.findByProps({ testID: 'evidence-capture' }).props.onPress();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'evidence-submit' }).props.onPress();
    });

    expect(runtime.files.protectOriginal).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      uri: 'file:///documents/misyra/evidence-working/original.jpg',
    });
    expect(runtime.files.discard).not.toHaveBeenCalled();
  });
});

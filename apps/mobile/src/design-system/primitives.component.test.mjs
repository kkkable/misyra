import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: (styles) => styles,
    hairlineWidth: 1,
  },
  Switch: 'Switch',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));

import {
  BottomSheet,
  ConfirmationDialog,
  IconButton,
  PrimaryButton,
  TextField,
  ToggleRow,
} from './primitives.tsx';

const flattenStyle = (style) =>
  Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));

const render = (element) => {
  let renderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

const buttonStyle = (renderer) => {
  const pressable = renderer.root.findByType('Pressable');
  return flattenStyle(pressable.props.style({ pressed: false }));
};

describe('MTS-009 rendered foundational primitives', () => {
  it('renders actual button states with role, label, minimum target, and flexible large-text layout', () => {
    const renderer = render(
      createElement(PrimaryButton, {
        accessibilityLabel: 'Save mission',
        colorScheme: 'light',
        label: 'Save this mission with a deliberately long Dynamic Type label',
        loading: true,
        onPress: vi.fn(),
      }),
    );

    const pressable = renderer.root.findByType('Pressable');
    const label = renderer.root.findByType('Text');
    const style = flattenStyle(pressable.props.style({ pressed: false }));
    const labelStyle = flattenStyle(label.props.style);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Save mission');
    expect(pressable.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(pressable.props.disabled).toBe(true);
    expect(style.minHeight).toBe(44);
    expect(style.minWidth).toBe(44);
    expect(style.height).toBeUndefined();
    expect(label.props.allowFontScaling).toBe(true);
    expect(labelStyle.flexShrink).toBe(1);
  });

  it('renders deterministic light and dark button visual states from the shared tokens', () => {
    const light = render(
      createElement(PrimaryButton, {
        accessibilityLabel: 'Continue',
        colorScheme: 'light',
        label: 'Continue',
        onPress: vi.fn(),
      }),
    );
    const dark = render(
      createElement(PrimaryButton, {
        accessibilityLabel: 'Continue',
        colorScheme: 'dark',
        label: 'Continue',
        onPress: vi.fn(),
      }),
    );

    expect({
      dark: buttonStyle(dark).backgroundColor,
      light: buttonStyle(light).backgroundColor,
    }).toEqual({
      dark: '#9B7AFF',
      light: '#6D3CF3',
    });
  });

  it('renders icon, field, and toggle accessibility semantics and exercises interaction', () => {
    const icon = render(
      createElement(IconButton, {
        accessibilityLabel: 'Close sheet',
        colorScheme: 'dark',
        icon: createElement('IconGlyph'),
        onPress: vi.fn(),
      }),
    ).root.findByType('Pressable');
    expect(icon.props.accessibilityRole).toBe('button');
    expect(icon.props.accessibilityLabel).toBe('Close sheet');

    const field = render(
      createElement(TextField, {
        accessibilityLabel: 'Mission title',
        colorScheme: 'light',
        errorMessage: 'Title is required',
        label: 'Title',
      }),
    ).root.findByType('TextInput');
    expect(field.props.accessibilityRole).toBe('text');
    expect(field.props.accessibilityLabel).toBe('Mission title');
    expect(field.props.allowFontScaling).toBe(true);

    const onValueChange = vi.fn();
    const toggle = render(
      createElement(ToggleRow, {
        accessibilityLabel: 'Private mission',
        colorScheme: 'light',
        label: 'Private',
        onValueChange,
        value: false,
      }),
    ).root.findByType('Pressable');
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityLabel).toBe('Private mission');
    expect(toggle.props.accessibilityState).toEqual({ checked: false, disabled: false });
    act(() => {
      toggle.props.onPress();
    });
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('keeps long bottom-sheet content scrollable so Dynamic Type cannot hide critical content', () => {
    const renderer = render(
      createElement(
        BottomSheet,
        {
          accessibilityLabel: 'Mission options',
          colorScheme: 'dark',
          dismissAccessibilityLabel: 'Dismiss mission options',
          onDismiss: vi.fn(),
          visible: true,
        },
        createElement('LongSheetContent'),
      ),
    );

    const scrollView = renderer.root.findByType('ScrollView');
    expect(scrollView.props.children.type).toBe('LongSheetContent');
    expect(flattenStyle(scrollView.props.style).flexShrink).toBe(1);
  });

  it('keeps long confirmation content and actions scrollable under large Dynamic Type', () => {
    const renderer = render(
      createElement(ConfirmationDialog, {
        accessibilityLabel: 'Delete mission confirmation',
        actions: createElement('DialogActions'),
        colorScheme: 'light',
        message:
          'This deliberately long confirmation message represents content at a large system text size.',
        onDismiss: vi.fn(),
        title: 'Delete this mission?',
        visible: true,
      }),
    );

    const dialog = renderer.root.findByProps({ accessibilityRole: 'alert' });
    expect(dialog.props.accessibilityLabel).toBe('Delete mission confirmation');
    const scrollView = renderer.root.findByType('ScrollView');
    expect(flattenStyle(scrollView.props.style).flexShrink).toBe(1);
    expect(scrollView.findByType('DialogActions')).toBeDefined();
  });
});

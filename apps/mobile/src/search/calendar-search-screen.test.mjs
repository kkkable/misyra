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
  const ScrollView = ({ children, ...props }) => createReactElement('ScrollView', props, children);
  const TextInput = (props) => createReactElement('TextInput', props);
  return {
    Pressable,
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    TextInput,
    View: 'View',
  };
});

import { CalendarSearchScreen } from './calendar-search-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const privateResult = {
  documentId: 'private-result',
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  title: 'Doctor appointment',
  location: 'Central Clinic',
  providerText: null,
  personalNoteExcerpt: 'allergy follow-up phrase',
  localDate: '2026-09-05',
};

const visibleResult = {
  documentId: 'visible-result',
  occurrenceId: '22222222-2222-4222-8222-222222222222',
  title: 'Morning Run',
  location: 'Kowloon',
  providerText: 'Training plan',
  personalNoteExcerpt: null,
  localDate: '2026-09-08',
};

function renderScreen({ search = vi.fn(() => Promise.resolve([])), onOpenResult = vi.fn() } = {}) {
  const onClose = vi.fn();
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarSearchScreen, {
        colorScheme: 'light',
        language: 'en',
        onClose,
        onOpenResult,
        search,
      }),
    );
  });
  return { renderer, onClose, search, onOpenResult };
}

function textContent(node) {
  if (typeof node === 'string') return node;
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  return textContent(node.children ?? []);
}

describe('MTS-049 Calendar search UI', () => {
  it('searches cached content from the text field and renders private-note excerpts only for attributed results', async () => {
    const search = vi.fn(() => Promise.resolve([privateResult, visibleResult]));
    const { renderer } = renderScreen({ search });
    const input = renderer.root.findByProps({ testID: 'calendar-search-input' });

    await act(async () => {
      input.props.onChangeText('allergy');
      await Promise.resolve();
    });

    expect(search).toHaveBeenCalledWith('allergy');
    expect(renderer.root.findByProps({ testID: 'calendar-search-result-private-result' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'calendar-search-result-visible-result' })).toBeDefined();
    expect(
      textContent(renderer.root.findByProps({ testID: 'calendar-search-personal-note-private-result' })),
    ).toContain('allergy follow-up phrase');
    expect(
      renderer.root.findAllByProps({ testID: 'calendar-search-personal-note-visible-result' }),
    ).toHaveLength(0);
    expect(textContent(renderer.toJSON())).toContain('5 Sep 2026');
  });

  it('shows the approved unavailable message when a result was deleted after results loaded', async () => {
    const search = vi.fn(() => Promise.resolve([visibleResult]));
    const onOpenResult = vi.fn(() => Promise.resolve(false));
    const { renderer, onClose } = renderScreen({ search, onOpenResult });
    const input = renderer.root.findByProps({ testID: 'calendar-search-input' });

    await act(async () => {
      input.props.onChangeText('Morning');
      await Promise.resolve();
    });
    const result = renderer.root.findByProps({ testID: 'calendar-search-result-visible-result' });
    await act(async () => {
      await result.props.onPress();
    });

    expect(onOpenResult).toHaveBeenCalledWith(visibleResult);
    expect(onClose).not.toHaveBeenCalled();
    expect(textContent(renderer.root.findByProps({ testID: 'calendar-search-unavailable' }))).toBe(
      'This mission is no longer available.',
    );
  });

  it('clears and closes the transient search surface after a successful result open', async () => {
    const search = vi.fn(() => Promise.resolve([visibleResult]));
    const onOpenResult = vi.fn(() => Promise.resolve(true));
    const { renderer, onClose } = renderScreen({ search, onOpenResult });
    const input = renderer.root.findByProps({ testID: 'calendar-search-input' });

    await act(async () => {
      input.props.onChangeText('Morning');
      await Promise.resolve();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'calendar-search-result-visible-result' }).props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

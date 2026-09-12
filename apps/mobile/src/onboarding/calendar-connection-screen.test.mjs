import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    Modal: 'Modal',
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
    Switch: 'Switch',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
  };
});

import { calendarConnectionMessagesForLocale } from './calendar-connection-flow.js';
import { CalendarConnectionScreen } from './calendar-connection-screen.js';

function renderScreen(state, overrides = {}) {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  const onDirectionChoice = vi.fn();
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarConnectionScreen, {
        colorScheme: 'light',
        messages: calendarConnectionMessagesForLocale('en'),
        onBack,
        onConfirm,
        onDirectionChoice,
        state,
        ...overrides,
      }),
    );
  });
  return { onBack, onConfirm, onDirectionChoice, renderer };
}

describe('MTS-068 rendered calendar connection direction flow', () => {
  it('offers exactly the two approved initial directions without duplicate matching or sync-status UI', () => {
    const { onDirectionChoice, renderer } = renderScreen({ step: 'direction', provider: 'google' });

    const external = renderer.root.findByProps({ testID: 'calendar-direction-external' });
    const misyra = renderer.root.findByProps({ testID: 'calendar-direction-misyra' });
    expect(renderer.root.findAllByType('Pressable')).toHaveLength(3);
    expect(
      renderer.root.findAll((node) =>
        ['calendar-duplicate-matching', 'calendar-sync-status'].includes(node.props?.testID),
      ),
    ).toHaveLength(0);

    act(() => external.props.onPress());
    act(() => misyra.props.onPress());
    expect(onDirectionChoice.mock.calls).toEqual([
      ['external_to_misyra'],
      ['misyra_to_external'],
    ]);
  });

  it('renders the future-only first confirmation and a separate final confirmation', () => {
    const messages = calendarConnectionMessagesForLocale('en');
    const first = renderScreen({
      step: 'confirm_initial',
      provider: 'apple',
      initialSyncDirection: 'external_to_misyra',
    });

    expect(first.renderer.root.findByProps({ children: messages.initialConfirmation })).toBeTruthy();
    expect(first.renderer.root.findByProps({ testID: 'calendar-direction-continue' })).toBeTruthy();
    expect(
      first.renderer.root.findAll((node) => node.props?.testID === 'calendar-direction-confirm'),
    ).toHaveLength(0);

    const final = renderScreen({
      step: 'confirm_final',
      provider: 'apple',
      initialSyncDirection: 'external_to_misyra',
    });
    expect(final.renderer.root.findByProps({ children: messages.finalConfirmation })).toBeTruthy();
    act(() => final.renderer.root.findByProps({ testID: 'calendar-direction-confirm' }).props.onPress());
    expect(final.onConfirm).toHaveBeenCalledOnce();
  });

  it('shows the single-connection guard without exposing a direction action', () => {
    const messages = calendarConnectionMessagesForLocale('zh-HK');
    const { renderer } = renderScreen(
      { step: 'blocked', reason: 'connection_exists' },
      { messages },
    );

    expect(renderer.root.findByProps({ children: messages.connectionExists })).toBeTruthy();
    expect(
      renderer.root.findAll((node) => node.props?.testID === 'calendar-direction-external'),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll((node) => node.props?.testID === 'calendar-direction-misyra'),
    ).toHaveLength(0);
  });
});

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
    Modal: 'Modal',
    Pressable,
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    TextInput,
    View: 'View',
  };
});

import * as detailsModule from './calendar-mission-details.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const recurringDetails = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Recurring mission',
  scheduleText: '9 Sep 2026 · 09:00–09:30',
  location: null,
  providerDescription: null,
  notes: null,
  personalNote: null,
  fieldOwnership: 'app_owned',
  calendarSource: 'internal',
  lifecycle: 'future',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  xpSummary: '30 XP',
  zeroXpReason: null,
  cancellationAttribution: null,
  recurrence: {
    pattern: { type: 'weekly', interval: 1, weekdays: [3], weekStartsOn: 1 },
    end: { type: 'never' },
  },
};

function find(renderer, testID) {
  return renderer.root.findByProps({ testID });
}

describe('MTS-052 recurring scope chooser', () => {
  it('requires an explicit scope before deleting a recurring occurrence and never defaults to entire series', () => {
    const onDelete = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(detailsModule.MissionDetailsScreen, {
          colorScheme: 'light',
          details: recurringDetails,
          language: 'en',
          onDelete,
        }),
      );
    });

    act(() => {
      find(renderer, 'mission-details-delete').props.onPress();
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(find(renderer, 'recurring-scope-this-occurrence')).toBeDefined();
    expect(find(renderer, 'recurring-scope-this-and-future')).toBeDefined();
    expect(find(renderer, 'recurring-scope-entire-series')).toBeDefined();
    expect(find(renderer, 'recurring-scope-chooser').props.accessibilityLabel).toContain('Delete');

    act(() => {
      find(renderer, 'recurring-scope-this-and-future').props.onPress();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(recurringDetails.id, 'this_and_future');
  });

  it('uses the same operation-agnostic component for restore and exposes all three localized scopes', () => {
    const ScopeChooser = detailsModule.CalendarRecurringScopeChooser;
    expect(typeof ScopeChooser).toBe('function');
    const onSelect = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(ScopeChooser, {
          colorScheme: 'light',
          language: 'zh-HK',
          operation: 'restore',
          onCancel: vi.fn(),
          onSelect,
        }),
      );
    });

    const renderedText = renderer.root
      .findAllByType('Text')
      .flatMap((node) => node.children)
      .filter((value) => typeof value === 'string')
      .join(' | ');
    expect(renderedText).toContain('只限今次');
    expect(renderedText).toContain('今次及之後');
    expect(renderedText).toContain('整個系列');

    act(() => {
      find(renderer, 'recurring-scope-this-occurrence').props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('this_occurrence');
  });
});

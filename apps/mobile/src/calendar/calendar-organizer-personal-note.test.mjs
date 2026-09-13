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

import { MissionDetailsScreen } from './calendar-mission-details.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const organizerDetails = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Organizer meeting',
  scheduleText: '15 Sep 2026 · 09:00–10:00',
  structuredSchedule: {
    date: '2026-09-15',
    start: '09:00',
    end: '10:00',
    timeZone: 'Asia/Hong_Kong',
    allDay: false,
  },
  recurring: false,
  location: 'Central',
  providerDescription: 'Organizer agenda',
  notes: null,
  personalNote: 'Ask about access',
  fieldOwnership: 'organizer_controlled',
  calendarSource: 'external',
  lifecycle: 'future',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  xpSummary: '45 XP',
  zeroXpReason: null,
  cancellationAttribution: null,
};

function find(renderer, testID) {
  return renderer.root.findByProps({ testID });
}

function findAll(renderer, testID) {
  return renderer.root.findAllByProps({ testID });
}

describe('MTS-072 organizer-controlled Mission Details ownership', () => {
  it('keeps provider-owned fields read-only while exposing an explicit personal-note save action', () => {
    const onPersonalNoteSave = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(MissionDetailsScreen, {
          colorScheme: 'light',
          details: organizerDetails,
          language: 'en',
          onPersonalNoteSave,
        }),
      );
    });

    for (const testID of [
      'mission-details-title',
      'mission-details-schedule',
      'mission-details-location',
      'mission-details-provider-description',
    ]) {
      expect(find(renderer, testID).props.editable).toBe(false);
    }
    expect(find(renderer, 'mission-details-personal-note').props.editable).toBe(true);
    expect(findAll(renderer, 'mission-details-save')).toHaveLength(0);

    const save = find(renderer, 'mission-details-personal-note-save');
    act(() => {
      save.props.onPress();
    });
    expect(onPersonalNoteSave).toHaveBeenCalledWith('Ask about access');
  });
});

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

const activeDetails = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Finish daily mission',
  scheduleText: '11 Sep 2026 · 09:00–09:30',
  structuredSchedule: {
    date: '2026-09-11',
    start: '09:00',
    end: '09:30',
    timeZone: 'Asia/Hong_Kong',
    allDay: false,
  },
  recurring: false,
  location: null,
  providerDescription: null,
  notes: null,
  personalNote: null,
  fieldOwnership: 'app_owned',
  calendarSource: 'internal',
  lifecycle: 'active',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  xpSummary: '100 XP',
  zeroXpReason: null,
  cancellationAttribution: null,
};

function renderDetails({ details = activeDetails, trustMode = false, onComplete = vi.fn() } = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(MissionDetailsScreen, {
        colorScheme: 'light',
        details,
        language: 'en',
        trustMode,
        onNoEvidenceComplete: onComplete,
      }),
    );
  });
  return { renderer, onComplete };
}

describe('MTS-059 Mission Details completion integration', () => {
  it('surfaces Private confirmation before the first evidence submission and confirms explicitly', () => {
    const { renderer, onComplete } = renderDetails();

    expect(
      renderer.root.findAllByProps({ testID: 'private-trust-completion-action' }).length,
    ).toBeGreaterThan(0);
    expect(onComplete).not.toHaveBeenCalled();

    act(() =>
      renderer.root.findByProps({ testID: 'private-trust-completion-action' }).props.onPress(),
    );
    act(() => renderer.root.findByProps({ testID: 'private-trust-completion-confirm' }).props.onPress());

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('private');
  });

  it('uses global Trust Mode for an unfinished mission after rejected evidence', () => {
    const { renderer, onComplete } = renderDetails({
      details: { ...activeDetails, evidenceState: 'rejected' },
      trustMode: true,
    });

    act(() =>
      renderer.root.findByProps({ testID: 'private-trust-completion-action' }).props.onPress(),
    );
    act(() => renderer.root.findByProps({ testID: 'private-trust-completion-confirm' }).props.onPress());

    expect(onComplete).toHaveBeenCalledWith('trust');
  });

  it('does not expose a no-evidence completion path during active evidence processing', () => {
    const { renderer } = renderDetails({
      details: { ...activeDetails, evidenceState: 'pending' },
      trustMode: true,
    });

    expect(renderer.root.findAllByProps({ testID: 'private-trust-completion-action' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'private-trust-mode-toggle' })).toHaveLength(0);
  });
});

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

import { MissionCard } from './calendar-mission-layout.js';
import { MissionDetailsScreen } from './calendar-mission-details.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseDetails = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Prepare documents',
  scheduleText: '7 Sep 2026 · 09:00–09:30',
  location: 'Central',
  providerDescription: null,
  notes: 'Bring passport',
  personalNote: null,
  fieldOwnership: 'app_owned',
  calendarSource: 'internal',
  lifecycle: 'future',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  xpSummary: '45 XP',
  zeroXpReason: null,
  cancellationAttribution: null,
};

function renderDetails(overrides = {}, language = 'en') {
  let renderer;
  act(() => {
    renderer = create(
      createElement(MissionDetailsScreen, {
        colorScheme: 'light',
        details: { ...baseDetails, ...overrides },
        language,
      }),
    );
  });
  return renderer;
}

function find(renderer, testID) {
  return renderer.root.findByProps({ testID });
}

function findAll(renderer, testID) {
  return renderer.root.findAllByProps({ testID });
}

function textContent(node) {
  if (typeof node === 'string') return node;
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  return textContent(node.children ?? []);
}

function accessibilitySnapshot(renderer) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole !== undefined)
    .map((node) => ({
      role: node.props.accessibilityRole,
      label: node.props.accessibilityLabel ?? textContent(node),
      disabled: node.props.accessibilityState?.disabled ?? false,
    }));
}

describe('MTS-046 Mission Details state matrix', () => {
  it('keeps future app-owned fields editable and hides internal metadata', () => {
    const renderer = renderDetails();

    for (const testID of [
      'mission-details-title',
      'mission-details-location',
      'mission-details-notes',
    ]) {
      expect(find(renderer, testID).props.editable).toBe(true);
    }

    expect(findAll(renderer, 'mission-details-personal-note')).toHaveLength(0);
    expect(findAll(renderer, 'mission-details-category')).toHaveLength(0);
    expect(findAll(renderer, 'mission-details-difficulty')).toHaveLength(0);
    expect(findAll(renderer, 'mission-details-ai-metadata')).toHaveLength(0);
  });

  it('keeps active app-owned fields editable while showing active status', () => {
    const renderer = renderDetails({ lifecycle: 'active' });

    expect(find(renderer, 'mission-details-title').props.editable).toBe(true);
    expect(textContent(renderer.toJSON())).toContain('Active');
  });

  it('protects organizer fields while allowing the private personal note', () => {
    const renderer = renderDetails({
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      providerDescription: 'Organizer agenda',
      notes: null,
      personalNote: 'Ask about access',
    });

    expect(find(renderer, 'mission-details-title').props.editable).toBe(false);
    expect(find(renderer, 'mission-details-location').props.editable).toBe(false);
    expect(find(renderer, 'mission-details-provider-description').props.editable).toBe(false);
    expect(find(renderer, 'mission-details-personal-note').props.editable).toBe(true);
    expect(textContent(renderer.toJSON())).toContain('Organizer-controlled');
  });

  it.each([
    ['completed', { completionState: 'completed', evidenceState: 'accepted' }],
    ['expired', { completionState: 'incomplete', evidenceState: 'not_submitted' }],
    [
      'cancelled',
      {
        calendarSource: 'external',
        fieldOwnership: 'organizer_controlled',
        cancellationAttribution: 'organizer',
      },
    ],
  ])('freezes every mission field for %s history', (lifecycle, overrides) => {
    const renderer = renderDetails({
      lifecycle,
      personalNote: 'Historical private note',
      ...overrides,
    });
    const fields = renderer.root.findAll((node) => {
      const { testID } = node.props;
      return typeof testID === 'string' && testID.startsWith('mission-details-');
    });
    const editableFields = fields.filter((node) => {
      return node.type === 'TextInput' && node.props.editable !== false;
    });

    expect(editableFields).toHaveLength(0);
  });

  it('shows the approved expiry message without a countdown or deadline', () => {
    const renderer = renderDetails({ lifecycle: 'expired' });
    const rendered = textContent(renderer.toJSON());

    expect(rendered).toContain('Completion window expired');
    expect(rendered).not.toContain('days left');
    expect(rendered).not.toContain('deadline');
    expect(findAll(renderer, 'mission-details-complete-action')).toHaveLength(0);
  });

  it('keeps organizer cancellation detail off Calendar cards', () => {
    const details = renderDetails({
      lifecycle: 'cancelled',
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      cancellationAttribution: 'organizer',
    });
    expect(textContent(details.toJSON())).toContain('Cancelled by organizer');

    let card;
    act(() => {
      card = create(
        createElement(MissionCard, {
          colorScheme: 'light',
          language: 'en',
          mission: {
            id: 'mission-1',
            title: 'Prepare documents',
            startMinute: 540,
            endMinute: 570,
            orderKey: '1',
            status: 'unfinished',
          },
          selected: false,
        }),
      );
    });
    expect(textContent(card.toJSON())).not.toContain('Cancelled');
  });

  it.each([
    ['not_submitted', 'Evidence not submitted'],
    ['pending', 'Evidence under review'],
    ['accepted', 'Evidence accepted'],
    ['rejected', 'Evidence not accepted'],
    ['not_required', 'No evidence required'],
  ])('renders written evidence state %s', (evidenceState, expectedCopy) => {
    const renderer = renderDetails({ evidenceState });
    expect(textContent(renderer.toJSON())).toContain(expectedCopy);
  });

  it('shows the permanent 0-XP reason without a confirmation action', () => {
    const renderer = renderDetails({
      rewardEligibility: 'ineligible',
      xpSummary: '0 XP',
      zeroXpReason: 'Created or moved into the past',
    });
    const rendered = textContent(renderer.toJSON());

    expect(rendered).toContain('0 XP');
    expect(rendered).toContain('Created or moved into the past');
    expect(findAll(renderer, 'mission-details-confirm-zero-xp')).toHaveLength(0);
  });

  it('exposes a stable accessibility snapshot for status and XP', () => {
    const renderer = renderDetails({
      completionState: 'completed',
      lifecycle: 'completed',
      evidenceState: 'accepted',
      rewardEligibility: 'ineligible',
      xpSummary: '0 XP',
      zeroXpReason: 'Edited after the start time',
    });

    expect(accessibilitySnapshot(renderer)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'header', label: 'Prepare documents' }),
        expect.objectContaining({ role: 'text', label: 'Completed' }),
        expect.objectContaining({ role: 'text', label: 'Evidence accepted' }),
        expect.objectContaining({ role: 'text', label: '0 XP' }),
      ]),
    );
  });
});

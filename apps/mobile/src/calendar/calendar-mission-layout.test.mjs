import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');

  const Pressable = ({ children, style, ...props }) =>
    createReactElement(
      'Pressable',
      { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
      typeof children === 'function' ? children({ pressed: false }) : children,
    );

  return {
    Modal: ({ children, ...props }) => createReactElement('Modal', props, children),
    Pressable,
    StyleSheet: {
      create: (styles) => styles,
    },
    Text: 'Text',
    View: 'View',
  };
});

import {
  MissionCard,
  TimedMissionLayer,
  buildMissionOverlapGroups,
  missionCardPalette,
} from './calendar-mission-layout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mission(id, startMinute = 540, endMinute = 600, status = 'unfinished') {
  return {
    id,
    title: `Mission ${id}`,
    startMinute,
    endMinute,
    orderKey: id,
    status,
  };
}

function geometry(groups) {
  return groups.map((group) => ({
    cards: group.cards.map((card) => ({
      height: card.height,
      id: card.mission.id,
      leftPercent: card.leftPercent,
      top: card.top,
      widthPercent: card.widthPercent,
    })),
    hiddenIds: group.hiddenMissions.map((item) => item.id),
  }));
}

function hostPressables(renderer, testID) {
  return renderer.root.findAll((node) => node.type === 'Pressable' && node.props.testID === testID);
}

function hostPressable(renderer, testID) {
  return renderer.root.find((node) => node.type === 'Pressable' && node.props.testID === testID);
}

function renderMissionCard(startMinute, endMinute) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(MissionCard, {
        colorScheme: 'light',
        language: 'en',
        mission: mission('target', startMinute, endMinute),
        selected: false,
      }),
    );
  });
  return hostPressable(renderer, 'calendar-mission-card-target');
}

describe('MTS-043 overlap matrix', () => {
  it('uses full width for one, side-by-side columns for two/three, and two cards plus overflow for four+', () => {
    const one = buildMissionOverlapGroups([mission('a')]);
    expect(one).toHaveLength(1);
    expect(one[0].cards).toHaveLength(1);
    expect(one[0].cards[0].leftPercent).toBe(0);
    expect(one[0].cards[0].widthPercent).toBe(100);
    expect(one[0].hiddenMissions).toHaveLength(0);

    const two = buildMissionOverlapGroups([mission('a'), mission('b')]);
    expect(two[0].cards.map((card) => card.leftPercent)).toEqual([0, 50]);
    expect(two[0].cards.map((card) => card.widthPercent)).toEqual([50, 50]);

    const three = buildMissionOverlapGroups([mission('a'), mission('b'), mission('c')]);
    expect(three[0].cards).toHaveLength(3);
    expect(three[0].cards[0].leftPercent).toBeCloseTo(0);
    expect(three[0].cards[1].leftPercent).toBeCloseTo(100 / 3);
    expect(three[0].cards[2].leftPercent).toBeCloseTo((100 / 3) * 2);
    expect(three[0].cards[0].widthPercent).toBeCloseTo(100 / 3);

    const four = buildMissionOverlapGroups([
      mission('a'),
      mission('b'),
      mission('c'),
      mission('d'),
    ]);
    expect(four[0].cards.map((card) => card.mission.id)).toEqual(['a', 'b']);
    expect(four[0].cards.map((card) => card.widthPercent)).toEqual([50, 50]);
    expect(four[0].hiddenMissions.map((item) => item.id)).toEqual(['c', 'd']);
  });

  it('uses simultaneous concurrency instead of connected-component size for a bridge chain', () => {
    const groups = buildMissionOverlapGroups([
      mission('a', 540, 600),
      mission('b', 570, 630),
      mission('c', 600, 660),
      mission('d', 630, 690),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].hiddenMissions).toHaveLength(0);
    expect(groups[0].cards.map((card) => card.mission.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(groups[0].cards.map((card) => card.leftPercent)).toEqual([0, 50, 0, 50]);
    expect(groups[0].cards.map((card) => card.widthPercent)).toEqual([50, 50, 50, 50]);
  });

  it('reuses released columns for staggered overlaps and treats equal boundaries as non-overlap', () => {
    const staggered = buildMissionOverlapGroups([
      mission('a', 540, 660),
      mission('b', 570, 600),
      mission('c', 600, 630),
    ]);
    expect(staggered).toHaveLength(1);
    expect(staggered[0].cards.map((card) => card.leftPercent)).toEqual([0, 50, 50]);

    const touching = buildMissionOverlapGroups([mission('a', 540, 600), mission('b', 600, 660)]);
    expect(touching).toHaveLength(2);
    expect(touching.map((group) => group.cards[0].widthPercent)).toEqual([100, 100]);
  });

  it('uses three deterministic columns for nested events', () => {
    const groups = buildMissionOverlapGroups([
      mission('a', 540, 660),
      mission('b', 550, 650),
      mission('c', 560, 640),
    ]);

    expect(groups[0].cards.map((card) => card.leftPercent)).toEqual([0, 100 / 3, (100 / 3) * 2]);
    expect(groups[0].cards.map((card) => card.widthPercent)).toEqual([100 / 3, 100 / 3, 100 / 3]);
  });

  it('limits a true four-way concurrency group to two visible columns and deterministic overflow', () => {
    const groups = buildMissionOverlapGroups([
      mission('a', 540, 660),
      mission('b', 550, 650),
      mission('c', 560, 620),
      mission('d', 570, 610),
      mission('e', 620, 680),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((card) => card.mission.id)).toEqual(['a', 'b']);
    expect(groups[0].cards.map((card) => card.widthPercent)).toEqual([50, 50]);
    expect(groups[0].hiddenMissions.map((item) => item.id)).toEqual(['c', 'd', 'e']);
  });

  it('keeps completed missions in the same overlap slots because status never participates in ordering', () => {
    const unfinished = [mission('a'), mission('b'), mission('c')];
    const completed = [
      mission('a', 540, 600, 'verified'),
      mission('b', 540, 600, 'private'),
      mission('c', 540, 600, 'late'),
    ];

    expect(geometry(buildMissionOverlapGroups(completed))).toEqual(
      geometry(buildMissionOverlapGroups(unfinished)),
    );
  });

  it('separates non-overlapping groups while preserving exact-minute vertical geometry', () => {
    const groups = buildMissionOverlapGroups([
      mission('a', 547, 592),
      mission('b', 547, 607),
      mission('c', 660, 690),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].cards[0]).toEqual(expect.objectContaining({ height: 45, top: 547 }));
    expect(groups[1].cards[0]).toEqual(expect.objectContaining({ height: 30, top: 660 }));
  });
});

describe('MTS-043 status and accessibility', () => {
  it('maps visible status only to the approved light/dark colour tokens', () => {
    expect([
      missionCardPalette('unfinished', 'light'),
      missionCardPalette('verified', 'light'),
      missionCardPalette('late', 'light'),
      missionCardPalette('private', 'light'),
      missionCardPalette('unfinished', 'dark'),
      missionCardPalette('verified', 'dark'),
      missionCardPalette('late', 'dark'),
      missionCardPalette('private', 'dark'),
    ]).toMatchInlineSnapshot(`
      [
        {
          "backgroundColor": "transparent",
          "borderColor": "#E7E5EF",
        },
        {
          "backgroundColor": "#EAF8EF",
          "borderColor": "#22A95B",
        },
        {
          "backgroundColor": "#FFF4D8",
          "borderColor": "#E89A12",
        },
        {
          "backgroundColor": "#F0F2F5",
          "borderColor": "#8A93A3",
        },
        {
          "backgroundColor": "transparent",
          "borderColor": "#343247",
        },
        {
          "backgroundColor": "#173325",
          "borderColor": "#54CF83",
        },
        {
          "backgroundColor": "#3C2E13",
          "borderColor": "#FFC04D",
        },
        {
          "backgroundColor": "#292D35",
          "borderColor": "#A9B0BD",
        },
      ]
    `);
  });

  it('announces written status without adding a visible status label or icon', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(MissionCard, {
          colorScheme: 'light',
          language: 'en',
          mission: mission('a', 540, 600, 'verified'),
          selected: false,
        }),
      );
    });

    const card = renderer.root.findByProps({ testID: 'calendar-mission-card-a' });
    expect(card.props.accessibilityLabel).toBe('Mission a, Accepted evidence, on time');
    expect(renderer.root.findAllByType('Text').map((node) => node.children.join(''))).toEqual([
      'Mission a',
    ]);
  });

  it('uses the focus ring as a selection outline without changing the status fill', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(MissionCard, {
          colorScheme: 'dark',
          language: 'en',
          mission: mission('a', 540, 600, 'late'),
          selected: true,
        }),
      );
    });

    const card = renderer.root.findByProps({ testID: 'calendar-mission-card-a' });
    expect(card.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: '#3C2E13' }),
        expect.objectContaining({ borderColor: '#B29CFF', borderWidth: 2 }),
      ]),
    );
  });

  it.each([
    [5, 19.5],
    [15, 14.5],
    [30, 7],
  ])('keeps a %i-minute card at an effective 44-point vertical target', (duration, inset) => {
    const card = renderMissionCard(540, 540 + duration);
    expect(card.props.hitSlop).toEqual({ bottom: inset, left: 0, right: 0, top: inset });
    expect(duration + card.props.hitSlop.top + card.props.hitSlop.bottom).toBeGreaterThanOrEqual(
      44,
    );
  });
});

describe('MTS-043 grouped overflow', () => {
  it('shows two cards and +N more, then opens a compact list containing the whole overlap group', () => {
    const missions = [mission('a'), mission('b'), mission('c'), mission('d')];
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedMissionLayer, {
          colorScheme: 'light',
          language: 'en',
          missions,
        }),
      );
    });

    expect(hostPressables(renderer, 'calendar-mission-card-a')).toHaveLength(1);
    expect(hostPressables(renderer, 'calendar-mission-card-b')).toHaveLength(1);
    expect(hostPressables(renderer, 'calendar-mission-card-c')).toHaveLength(0);
    const more = hostPressable(renderer, 'calendar-overlap-more-overlap-0');
    expect(more.findByType('Text').children.join('')).toContain('+2 more');
    expect(more.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: 44, minWidth: 44 })]),
    );

    act(() => more.props.onPress());

    const list = renderer.root.findByProps({ testID: 'calendar-overlap-list-overlap-0' });
    expect(
      list.findAll(
        (node) =>
          node.type === 'Pressable' &&
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('calendar-overlap-list-mission-'),
      ),
    ).toHaveLength(4);
  });
});

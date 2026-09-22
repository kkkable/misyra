import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  activeMission: {
    id: 'active-mission',
    title: 'Active mission',
    startMinute: 540,
    endMinute: 600,
    orderKey: 'active',
    status: 'unfinished',
    rewardEligibility: 'eligible',
    timeZone: 'Asia/Hong_Kong',
  },
  listWindow: vi.fn(async () => [{ id: 'local-active' }]),
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ uses24hourClock: true }],
}));

vi.mock('../storage/local-repositories.js', () => ({
  createLocalRepositories: () => ({
    calendar: { listWindow: state.listWindow },
  }),
}));

vi.mock('../calendar/calendar-mission-projection.js', () => ({
  calendarWindow: () => ({ startLocalDate: '2024-01-01', endLocalDate: '2028-01-01' }),
  projectLocalMissionForAppTimeZone: (mission) => mission,
  calendarMissionMaps: () => ({
    allDay: {},
    timed: { '2026-09-23': [state.activeMission] },
  }),
}));

vi.mock('../calendar/calendar-day-screen.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    CalendarDayScreen: (props) => createReactElement('CalendarDayScreen', props),
  };
});

vi.mock('../calendar/calendar-mission-form-sheet.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    CalendarMissionFormSheet: (props) => createReactElement('CalendarMissionFormSheet', props),
  };
});

import { AiPlannerCalendarPreview } from './ai-planner-calendar-preview.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const item = Object.freeze({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Draft lunch',
  localDate: '2026-09-23',
  startLocalTime: '12:00',
  endLocalTime: '13:00',
  allDay: false,
  estimatedMinutes: 60,
  timeZone: 'Asia/Hong_Kong',
});

const document = Object.freeze({
  text: 'Plan lunch',
  imageAssetIds: Object.freeze([]),
  items: Object.freeze([item]),
});

function updatedDocument(items = document.items) {
  return Object.freeze({ ...document, items: Object.freeze([...items]) });
}

describe('MTS-088 integrated AI Planner Calendar preview', () => {
  it('merges active and draft missions and routes only draft actions to Planner', async () => {
    const store = {
      add: vi.fn(async () => updatedDocument()),
      update: vi.fn(async () => updatedDocument()),
      adjust: vi.fn(async () => updatedDocument()),
      remove: vi.fn(async () => updatedDocument([])),
      load: vi.fn(),
    };
    const onDocumentChange = vi.fn();
    let renderer;

    await act(async () => {
      renderer = create(
        createElement(AiPlannerCalendarPreview, {
          accountId: '11111111-1111-4111-8111-111111111111',
          appTimeZone: 'Asia/Hong_Kong',
          colorScheme: 'light',
          database: {},
          document,
          language: 'en',
          onDocumentChange,
          store,
        }),
      );
      await Promise.resolve();
    });

    const calendar = renderer.root.findByType('CalendarDayScreen');
    expect(calendar.props.creationMode).toBe('planner_draft');
    expect(calendar.props.initialDate).toBe('2026-09-23');
    const previewMissions = calendar.props.timedMissionsByDate['2026-09-23'];
    expect(previewMissions.map((mission) => mission.id)).toEqual(['active-mission', item.id]);
    expect(calendar.props.isMissionAdjustable(state.activeMission)).toBe(false);
    expect(calendar.props.isMissionAdjustable(previewMissions[1])).toBe(true);

    const createInput = {
      selectedDate: '2026-09-23',
      title: 'Manual draft',
      allDay: false,
      startMinute: 840,
      endMinute: 900,
      estimatedEffortMinutes: null,
      rewardEligibility: 'ineligible',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: null,
      notes: null,
    };
    await act(async () => {
      await calendar.props.onCreateMission(createInput);
    });
    expect(store.add).toHaveBeenCalledWith(createInput);

    await act(async () => {
      await calendar.props.onMissionAdjustment({
        allowed: true,
        missionId: 'active-mission',
        kind: 'move',
        previousStartMinute: 540,
        previousEndMinute: 600,
        startMinute: 555,
        endMinute: 615,
        rewardEligibility: 'eligible',
        warning: null,
      });
    });
    expect(store.adjust).not.toHaveBeenCalled();

    await act(async () => {
      await calendar.props.onMissionAdjustment({
        allowed: true,
        missionId: item.id,
        kind: 'resize',
        previousStartMinute: 720,
        previousEndMinute: 780,
        startMinute: 720,
        endMinute: 795,
        rewardEligibility: 'ineligible',
        warning: null,
      });
    });
    expect(store.adjust).toHaveBeenCalledWith({
      missionId: item.id,
      startMinute: 720,
      endMinute: 795,
      rewardEligibility: 'ineligible',
      source: 'resize',
    });

    await act(async () => {
      calendar.props.onTimedMissionPress(previewMissions[1]);
    });
    const form = renderer.root.findByType('CalendarMissionFormSheet');
    expect(form.props.mode).toBe('planner_draft');

    await act(async () => {
      await form.props.onDelete();
    });
    expect(store.remove).toHaveBeenCalledWith(item.id);
    expect(onDocumentChange).toHaveBeenCalled();
  });
});

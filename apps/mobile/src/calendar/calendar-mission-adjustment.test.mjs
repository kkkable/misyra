import { describe, expect, it, vi } from 'vitest';

import { createMotionPreference } from '../experience/reduce-motion.js';
import {
  commitMissionAdjustment,
  createMissionAdjustmentUndoController,
  previewMissionAdjustment,
  snapTimelineMinute,
} from './calendar-mission-adjustment.js';

const futureMission = {
  id: 'mission-a',
  startMinute: 600,
  endMinute: 645,
  rewardEligibility: 'eligible',
  timeZone: 'Asia/Tokyo',
};

describe('MTS-047 timeline adjustment core', () => {
  it('tracks the finger directly during move preview without premature snapping', () => {
    expect(previewMissionAdjustment(futureMission, 'move', 17)).toEqual({
      startMinute: 617,
      endMinute: 662,
    });
  });

  it('snaps move release to 15 minutes while preserving exact duration', () => {
    expect(snapTimelineMinute(617)).toBe(615);
    expect(
      commitMissionAdjustment({
        mission: futureMission,
        kind: 'move',
        translationY: 17,
        selectedDate: '2026-09-08',
        now: new Date('2026-09-07T07:00:00.000Z'),
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: true,
        startMinute: 615,
        endMinute: 660,
        warning: null,
        rewardEligibility: 'eligible',
      }),
    );
  });

  it('snaps resize release and never collapses below one snap interval', () => {
    expect(previewMissionAdjustment(futureMission, 'resize', -80)).toEqual({
      startMinute: 600,
      endMinute: 615,
    });
    expect(
      commitMissionAdjustment({
        mission: futureMission,
        kind: 'resize',
        translationY: 22,
        selectedDate: '2026-09-08',
        now: new Date('2026-09-07T07:00:00.000Z'),
      }),
    ).toEqual(expect.objectContaining({ startMinute: 600, endMinute: 675 }));
  });

  it('warns and permanently locks 0 XP when a future mission is moved into the past', () => {
    const result = commitMissionAdjustment({
      mission: {
        ...futureMission,
        startMinute: 540,
        endMinute: 600,
      },
      kind: 'move',
      translationY: -120,
      selectedDate: '2026-09-07',
      now: new Date('2026-09-07T07:30:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        startMinute: 420,
        endMinute: 480,
        rewardEligibility: 'ineligible',
        warning: 'past_zero_xp',
      }),
    );
  });

  it('synchronizes commit and Undo while keeping irreversible XP ineligibility', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = createMissionAdjustmentUndoController(save);
    const committed = {
      allowed: true,
      missionId: 'mission-a',
      kind: 'move',
      previousStartMinute: 540,
      previousEndMinute: 600,
      startMinute: 420,
      endMinute: 480,
      rewardEligibility: 'ineligible',
      warning: 'past_zero_xp',
    };

    const savePromise = controller.commit(committed);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({
      missionId: 'mission-a',
      startMinute: 420,
      endMinute: 480,
      rewardEligibility: 'ineligible',
      source: 'move',
    });
    await savePromise;

    await expect(controller.undo()).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({
      missionId: 'mission-a',
      startMinute: 540,
      endMinute: 600,
      rewardEligibility: 'ineligible',
      source: 'undo',
    });
    await expect(controller.undo()).resolves.toBe(false);
  });

  it('keeps direct drag enabled when Reduce Motion is on', () => {
    expect(createMotionPreference(false).directDrag).toBe(true);
    expect(createMotionPreference(true).directDrag).toBe(true);
  });
});

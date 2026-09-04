import { describe, expect, it, vi } from 'vitest';

import { applyServerConflict } from './conflict-application.js';

function effects() {
  return {
    reloadMission: vi.fn(async () => undefined),
    reloadStory: vi.fn(async () => undefined),
    clearStoryUndoHistory: vi.fn(),
    deleteWorkingFile: vi.fn(async () => undefined),
    showMessage: vi.fn(),
  };
}

describe('MTS-032 conflict application', () => {
  it('reloads active mission work and shows the approved update/deletion copy', async () => {
    const updated = effects();
    await applyServerConflict(
      { kind: 'mission_updated', missionId: 'mission-a' },
      { missionId: 'mission-a' },
      updated,
    );
    expect(updated.reloadMission).toHaveBeenCalledWith('mission-a');
    expect(updated.showMessage).toHaveBeenCalledWith('This mission was updated on another device.');

    const deleted = effects();
    await applyServerConflict(
      { kind: 'mission_deleted', missionId: 'mission-a' },
      { missionId: 'mission-a' },
      deleted,
    );
    expect(deleted.reloadMission).toHaveBeenCalledWith('mission-a');
    expect(deleted.showMessage).toHaveBeenCalledWith('This mission was deleted on another device.');
  });

  it('cleans duplicate evidence and shows completion copy only for affected active work', async () => {
    const active = effects();
    await applyServerConflict(
      {
        kind: 'mission_completed_elsewhere',
        missionId: 'mission-a',
        duplicateWorkingFiles: ['evidence-a.jpg', 'evidence-a.thumb'],
      },
      { missionId: 'mission-a' },
      active,
    );
    expect(active.deleteWorkingFile.mock.calls.map(([path]) => path)).toEqual([
      'evidence-a.jpg',
      'evidence-a.thumb',
    ]);
    expect(active.reloadMission).toHaveBeenCalledWith('mission-a');
    expect(active.showMessage).toHaveBeenCalledWith(
      'This mission was already completed on another device.',
    );

    const background = effects();
    await applyServerConflict(
      {
        kind: 'mission_completed_elsewhere',
        missionId: 'mission-b',
        duplicateWorkingFiles: ['evidence-b.jpg'],
      },
      { missionId: 'mission-a' },
      background,
    );
    expect(background.deleteWorkingFile).toHaveBeenCalledWith('evidence-b.jpg');
    expect(background.showMessage).not.toHaveBeenCalled();
  });

  it('reloads a losing active Story, clears undo history, and uses approved copy', async () => {
    const fx = effects();
    await applyServerConflict(
      { kind: 'story_updated', storyDraftId: 'story-a' },
      { storyDraftId: 'story-a' },
      fx,
    );
    expect(fx.reloadStory).toHaveBeenCalledWith('story-a');
    expect(fx.clearStoryUndoHistory).toHaveBeenCalledWith('story-a');
    expect(fx.showMessage).toHaveBeenCalledWith('This Story draft was updated on another device.');
  });

  it('keeps unrelated background progress silent', async () => {
    const fx = effects();
    await applyServerConflict(
      { kind: 'background_progress', missionId: 'mission-b' },
      { missionId: 'mission-a', storyDraftId: 'story-a' },
      fx,
    );
    expect(fx.showMessage).not.toHaveBeenCalled();
    expect(fx.clearStoryUndoHistory).not.toHaveBeenCalled();
    expect(fx.deleteWorkingFile).not.toHaveBeenCalled();
  });
});

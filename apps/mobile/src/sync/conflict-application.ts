export type ActiveConflictWork = Readonly<{
  missionId?: string;
  storyDraftId?: string;
}>;

export type ServerConflictResult =
  | Readonly<{ kind: 'mission_updated'; missionId: string }>
  | Readonly<{ kind: 'mission_deleted'; missionId: string }>
  | Readonly<{
      kind: 'mission_completed_elsewhere';
      missionId: string;
      duplicateWorkingFiles: readonly string[];
    }>
  | Readonly<{ kind: 'story_updated'; storyDraftId: string }>
  | Readonly<{ kind: 'background_progress'; missionId?: string }>;

export interface ConflictApplicationEffects {
  reloadMission(missionId: string): Promise<void>;
  reloadStory(storyDraftId: string): Promise<void>;
  clearStoryUndoHistory(storyDraftId: string): void;
  deleteWorkingFile(path: string): Promise<void>;
  showMessage(message: string): void;
}

export const conflictMessages = {
  missionUpdated: 'This mission was updated on another device.',
  missionDeleted: 'This mission was deleted on another device.',
  missionCompletedElsewhere: 'This mission was already completed on another device.',
  storyUpdated: 'This Story draft was updated on another device.',
} as const;

function isActiveMission(activeWork: ActiveConflictWork, missionId: string): boolean {
  return activeWork.missionId === missionId;
}

export async function applyServerConflict(
  conflict: ServerConflictResult,
  activeWork: ActiveConflictWork,
  effects: ConflictApplicationEffects,
): Promise<void> {
  switch (conflict.kind) {
    case 'mission_updated':
      if (!isActiveMission(activeWork, conflict.missionId)) return;
      await effects.reloadMission(conflict.missionId);
      effects.showMessage(conflictMessages.missionUpdated);
      return;

    case 'mission_deleted':
      if (!isActiveMission(activeWork, conflict.missionId)) return;
      await effects.reloadMission(conflict.missionId);
      effects.showMessage(conflictMessages.missionDeleted);
      return;

    case 'mission_completed_elsewhere':
      for (const path of conflict.duplicateWorkingFiles) {
        await effects.deleteWorkingFile(path);
      }
      if (!isActiveMission(activeWork, conflict.missionId)) return;
      await effects.reloadMission(conflict.missionId);
      effects.showMessage(conflictMessages.missionCompletedElsewhere);
      return;

    case 'story_updated':
      if (activeWork.storyDraftId !== conflict.storyDraftId) return;
      await effects.reloadStory(conflict.storyDraftId);
      effects.clearStoryUndoHistory(conflict.storyDraftId);
      effects.showMessage(conflictMessages.storyUpdated);
      return;

    case 'background_progress':
      return;
  }
}

export type ActiveConflictWork = Readonly<{
  missionId?: string;
  storyDraftId?: string;
}>;

export type ConflictOutcome =
  | Readonly<{ kind: 'mission_updated'; missionId: string }>
  | Readonly<{ kind: 'mission_deleted'; missionId: string }>
  | Readonly<{ kind: 'mission_completed_elsewhere'; missionId: string }>
  | Readonly<{ kind: 'story_updated'; storyDraftId: string }>;

export type ServerConflictResult =
  ConflictOutcome | Readonly<{ kind: 'background_progress'; missionId?: string }>;

export interface ConflictApplicationEffects {
  reloadMission(missionId: string): Promise<void>;
  reloadStory(storyDraftId: string): Promise<void>;
  clearStoryUndoHistory(storyDraftId: string): void;
  deleteDuplicateEvidenceWorkingFiles(missionId: string): Promise<void>;
  showMessage(messageKey: ConflictMessageKey): void;
}

export const conflictMessageKeys = {
  missionUpdated: 'sync.conflict.missionUpdated',
  missionDeleted: 'sync.conflict.missionDeleted',
  missionCompletedElsewhere: 'sync.conflict.missionCompletedElsewhere',
  storyUpdated: 'sync.conflict.storyUpdated',
} as const;

export type ConflictMessageKey = (typeof conflictMessageKeys)[keyof typeof conflictMessageKeys];

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
      effects.showMessage(conflictMessageKeys.missionUpdated);
      return;

    case 'mission_deleted':
      if (!isActiveMission(activeWork, conflict.missionId)) return;
      await effects.reloadMission(conflict.missionId);
      effects.showMessage(conflictMessageKeys.missionDeleted);
      return;

    case 'mission_completed_elsewhere':
      await effects.deleteDuplicateEvidenceWorkingFiles(conflict.missionId);
      if (!isActiveMission(activeWork, conflict.missionId)) return;
      await effects.reloadMission(conflict.missionId);
      effects.showMessage(conflictMessageKeys.missionCompletedElsewhere);
      return;

    case 'story_updated':
      if (activeWork.storyDraftId !== conflict.storyDraftId) return;
      await effects.reloadStory(conflict.storyDraftId);
      effects.clearStoryUndoHistory(conflict.storyDraftId);
      effects.showMessage(conflictMessageKeys.storyUpdated);
      return;

    case 'background_progress':
      return;
  }
}

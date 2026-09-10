export type MissionTapResolution = Readonly<{
  selectedMissionId: string;
  openDetails: boolean;
}>;

export type CalendarMissionTapResolution = MissionTapResolution;

function resolveTap(
  selectedMissionId: string | null | undefined,
  missionId: string,
): MissionTapResolution {
  if (missionId.trim().length === 0) throw new TypeError('Mission ID must not be empty.');
  return {
    selectedMissionId: missionId,
    openDetails: selectedMissionId === missionId,
  };
}

export function resolveMissionTap(
  selectedMissionId: string | null,
  missionId: string,
): MissionTapResolution {
  return resolveTap(selectedMissionId, missionId);
}

export function resolveCalendarMissionTap(
  selectedMissionId: string | undefined,
  missionId: string,
): CalendarMissionTapResolution {
  return resolveTap(selectedMissionId, missionId);
}

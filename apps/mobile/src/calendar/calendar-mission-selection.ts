export type MissionTapResolution = Readonly<{
  selectedMissionId: string;
  openDetails: boolean;
}>;

export function resolveMissionTap(
  selectedMissionId: string | null,
  missionId: string,
): MissionTapResolution {
  if (missionId.trim().length === 0) throw new TypeError('Mission ID must not be empty.');
  return {
    selectedMissionId: missionId,
    openDetails: selectedMissionId === missionId,
  };
}

export type CalendarMissionTapResolution = Readonly<{
  selectedMissionId: string;
  openDetails: boolean;
}>;

export function resolveCalendarMissionTap(
  selectedMissionId: string | undefined,
  tappedMissionId: string,
): CalendarMissionTapResolution {
  if (tappedMissionId.trim().length === 0) {
    throw new TypeError('Tapped mission ID must not be empty.');
  }

  return {
    selectedMissionId: tappedMissionId,
    openDetails: selectedMissionId === tappedMissionId,
  };
}

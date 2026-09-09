const DOMAIN_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function platformFirstWeekdayToDomain(firstWeekday: number | undefined): number {
  if (!Number.isInteger(firstWeekday) || firstWeekday === undefined || firstWeekday < 1 || firstWeekday > 7) {
    return 1;
  }
  return firstWeekday - 1;
}

export function orderWeekdaysFromRegionStart(weekStartsOn: number): readonly number[] {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError('Week start must be an integer from 0 through 6.');
  }
  return DOMAIN_WEEKDAYS.map((_, offset) => (weekStartsOn + offset) % 7);
}

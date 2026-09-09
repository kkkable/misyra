const DOMAIN_WEEKDAY_COUNT = 7;
const DEFAULT_DOMAIN_WEEK_START = 1;

export function domainWeekStartFromRegionalFirstWeekday(firstWeekday: unknown): number {
  const value = Number(firstWeekday);
  if (!Number.isInteger(value) || value < 1 || value > DOMAIN_WEEKDAY_COUNT) {
    return DEFAULT_DOMAIN_WEEK_START;
  }
  return value - 1;
}

export function orderedDomainWeekdays(weekStartsOn: number): readonly number[] {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn >= DOMAIN_WEEKDAY_COUNT) {
    throw new RangeError('Domain week start must be an integer from 0 to 6.');
  }
  return Object.freeze(
    Array.from(
      { length: DOMAIN_WEEKDAY_COUNT },
      (_, offset) => (weekStartsOn + offset) % DOMAIN_WEEKDAY_COUNT,
    ),
  );
}

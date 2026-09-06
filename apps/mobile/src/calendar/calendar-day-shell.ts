const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_OTHER_DATE_MINUTE = 8 * 60;

export type CalendarLaunchReason = 'current-time' | 'first-mission' | 'default-0800' | 'preserved';

export interface CalendarLaunchInput {
  readonly selectedDate: string;
  readonly today: string;
  readonly currentMinute: number;
  readonly firstTimedMissionMinute?: number;
  readonly preservedMinute?: number;
  readonly returningFromBackground?: boolean;
}

export interface CalendarLaunchPosition {
  readonly date: string;
  readonly minute: number;
  readonly reason: CalendarLaunchReason;
}

export interface CalendarStripDay {
  readonly date: string;
  readonly dayOfMonth: number;
  readonly weekday: number;
  readonly selected: boolean;
}

export interface ResponsiveCalendarLayout {
  readonly compactHeader: boolean;
  readonly dayCellWidth: number;
  readonly horizontalPadding: number;
}

function parseLocalDate(value: string): Date | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatLocalDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveInitialCalendarDate(deepLinkDate: unknown, today: string): string {
  const candidate = Array.isArray(deepLinkDate) ? deepLinkDate[0] : deepLinkDate;
  return typeof candidate === 'string' && parseLocalDate(candidate) !== null ? candidate : today;
}

function boundedMinute(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 && value < 24 * 60 ? Math.floor(value) : fallback;
}

export function resolveCalendarLaunch(input: CalendarLaunchInput): CalendarLaunchPosition {
  if (input.returningFromBackground === true && input.preservedMinute !== undefined) {
    return {
      date: input.selectedDate,
      minute: boundedMinute(input.preservedMinute, DEFAULT_OTHER_DATE_MINUTE),
      reason: 'preserved',
    };
  }

  if (input.selectedDate === input.today) {
    return {
      date: input.selectedDate,
      minute: boundedMinute(input.currentMinute, DEFAULT_OTHER_DATE_MINUTE),
      reason: 'current-time',
    };
  }

  if (input.firstTimedMissionMinute !== undefined) {
    return {
      date: input.selectedDate,
      minute: boundedMinute(input.firstTimedMissionMinute, DEFAULT_OTHER_DATE_MINUTE),
      reason: 'first-mission',
    };
  }

  return {
    date: input.selectedDate,
    minute: DEFAULT_OTHER_DATE_MINUTE,
    reason: 'default-0800',
  };
}

export function shouldShowTodayButton(selectedDate: string, today: string): boolean {
  return selectedDate !== today;
}

export function buildSevenDayStrip(selectedDate: string, firstWeekday: number): CalendarStripDay[] {
  const selected = parseLocalDate(selectedDate);
  if (selected === null)
    throw new TypeError('Selected Calendar date must use a valid YYYY-MM-DD value.');
  if (!Number.isInteger(firstWeekday) || firstWeekday < 1 || firstWeekday > 7) {
    throw new RangeError('Regional first weekday must be an integer from 1 through 7.');
  }

  const selectedWeekday = selected.getUTCDay() + 1;
  const offset = (selectedWeekday - firstWeekday + 7) % 7;
  const start = new Date(selected.getTime() - offset * 24 * 60 * 60 * 1000);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const localDate = formatLocalDate(date);
    return {
      date: localDate,
      dayOfMonth: date.getUTCDate(),
      weekday: date.getUTCDay() + 1,
      selected: localDate === selectedDate,
    };
  });
}

export function buildMonthGrid(selectedDate: string, firstWeekday: number): CalendarStripDay[] {
  const selected = parseLocalDate(selectedDate);
  if (selected === null)
    throw new TypeError('Selected Calendar date must use a valid YYYY-MM-DD value.');
  const monthStart = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
  const monthStartValue = formatLocalDate(monthStart);
  const firstVisible = buildSevenDayStrip(monthStartValue, firstWeekday)[0];
  const start = parseLocalDate(firstVisible.date);
  if (start === null) throw new TypeError('Unable to build Calendar month grid.');

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const localDate = formatLocalDate(date);
    return {
      date: localDate,
      dayOfMonth: date.getUTCDate(),
      weekday: date.getUTCDay() + 1,
      selected: localDate === selectedDate,
    };
  });
}

export function resolveResponsiveCalendarLayout(width: number): ResponsiveCalendarLayout {
  if (!Number.isFinite(width) || width <= 0)
    throw new RangeError('Calendar width must be positive.');
  if (width < 375) {
    return { compactHeader: true, dayCellWidth: 40, horizontalPadding: 12 };
  }
  return { compactHeader: false, dayCellWidth: 52, horizontalPadding: 16 };
}

export function localDateFromNow(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

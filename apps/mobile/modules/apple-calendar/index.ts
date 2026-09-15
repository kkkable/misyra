import { requireOptionalNativeModule } from 'expo';

export type AppleCalendarAuthorizationStatus =
  'not_determined' | 'restricted' | 'denied' | 'write_only' | 'full_access';

export type AppleCalendarInfo = {
  calendarIdentifier: string;
  title: string;
  allowsContentModifications: boolean;
};

export type AppleCalendarNativeEvent = {
  eventIdentifier: string;
  calendarIdentifier: string;
  title: string | null;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  location: string | null;
  providerNotes: string | null;
  recurrence: Record<string, unknown> | null;
};

export type AppleCalendarEventWrite = {
  title: string;
  schedule: Record<string, unknown>;
  recurrence: Record<string, unknown> | null;
  location: string | null;
  providerNotes: string | null;
};

export type AppleCalendarNativeModule = {
  getAuthorizationStatus(): Promise<AppleCalendarAuthorizationStatus>;
  requestFullAccess(userSelectedAppleCalendar: boolean): Promise<boolean>;
  listCalendars(): Promise<AppleCalendarInfo[]>;
  createDedicatedCalendar(title: string): Promise<AppleCalendarInfo>;
  fetchEvents(
    calendarIdentifier: string,
    startInstant: string,
    endInstant: string,
  ): Promise<AppleCalendarNativeEvent[]>;
  createEvent(
    calendarIdentifier: string,
    event: AppleCalendarEventWrite,
  ): Promise<AppleCalendarNativeEvent>;
  updateEvent(
    eventIdentifier: string,
    event: AppleCalendarEventWrite,
  ): Promise<AppleCalendarNativeEvent>;
  deleteEvent(eventIdentifier: string): Promise<void>;
};

export const AppleCalendarNativeModule =
  requireOptionalNativeModule<AppleCalendarNativeModule>('AppleCalendar');

export const isAppleCalendarNativeModuleAvailable = AppleCalendarNativeModule !== null;

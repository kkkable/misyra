import type { LocalizationLocale } from './catalogs.js';

export type NotificationSettingsCatalog = Readonly<{
  title: string;
  notifications: string;
  enabled: string;
  denied: string;
  notEnabled: string;
  unavailable: string;
  enable: string;
  openSettings: string;
  connectedCalendar: string;
  calendarConnected: string;
  calendarPermissionRevoked: string;
  calendarProviderUnavailable: string;
  calendarDisconnected: string;
  hiddenCalendarEvents: string;
  noHiddenCalendarEvents: string;
  restoreHiddenCalendarEvent: string;
}>;

export const notificationSettingsCatalogs: Readonly<
  Record<LocalizationLocale, NotificationSettingsCatalog>
> = Object.freeze({
  en: Object.freeze({
    title: 'Settings',
    notifications: 'Notifications',
    enabled: 'Enabled',
    denied: 'Denied',
    notEnabled: 'Not enabled',
    unavailable: 'Unavailable',
    enable: 'Enable notifications',
    openSettings: 'Open system settings',
    connectedCalendar: 'Connected Calendar',
    calendarConnected: 'Connected',
    calendarPermissionRevoked: 'Calendar permission needs to be restored',
    calendarProviderUnavailable: 'Calendar service is temporarily unavailable',
    calendarDisconnected: 'Disconnected',
    hiddenCalendarEvents: 'Hidden calendar events',
    noHiddenCalendarEvents: 'No upcoming hidden events',
    restoreHiddenCalendarEvent: 'Restore',
  }),
  'zh-HK': Object.freeze({
    title: '設定',
    notifications: '通知',
    enabled: '已啟用',
    denied: '已拒絕',
    notEnabled: '尚未啟用',
    unavailable: '無法使用',
    enable: '啟用通知',
    openSettings: '開啟系統設定',
    connectedCalendar: '已連接日曆',
    calendarConnected: '已連接',
    calendarPermissionRevoked: '需要重新授權日曆權限',
    calendarProviderUnavailable: '日曆服務暫時無法使用',
    calendarDisconnected: '已中斷連接',
    hiddenCalendarEvents: '已隱藏日曆活動',
    noHiddenCalendarEvents: '沒有即將到來的已隱藏活動',
    restoreHiddenCalendarEvent: '還原',
  }),
});

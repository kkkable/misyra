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
    hiddenCalendarEvents: '已隱藏日曆活動',
    noHiddenCalendarEvents: '沒有即將到來的已隱藏活動',
    restoreHiddenCalendarEvent: '還原',
  }),
});

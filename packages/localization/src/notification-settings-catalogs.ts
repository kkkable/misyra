import type { LocalizationLocale } from './catalogs.js';

export type NotificationSettingsCatalog = Readonly<{
  title: string;
  accountAndPreferences: string;
  trustMode: string;
  connectedCalendar: string;
  language: string;
  englishLanguage: string;
  traditionalChineseHongKongLanguage: string;
  privacy: string;
  diagnostics: string;
  mediaRetention: string;
  privacyPolicy: string;
  termsOfService: string;
  deleteAccount: string;
  calendarAndMissions: string;
  hiddenCalendarEvents: string;
  notificationStatus: string;
  story: string;
  storyStyleProfile: string;
  help: string;
  faq: string;
  sendFeedback: string;
  reportProblem: string;
  about: string;
  signOut: string;
  notifications: string;
  enabled: string;
  denied: string;
  notEnabled: string;
  unavailable: string;
  enable: string;
  openSettings: string;
  calendarConnected: string;
  calendarPermissionRevoked: string;
  calendarProviderUnavailable: string;
  calendarDisconnected: string;
  noHiddenCalendarEvents: string;
  restoreHiddenCalendarEvent: string;
}>;

export const notificationSettingsCatalogs: Readonly<
  Record<LocalizationLocale, NotificationSettingsCatalog>
> = Object.freeze({
  en: Object.freeze({
    title: 'Settings',
    accountAndPreferences: 'Account and preferences',
    trustMode: 'Trust Mode',
    connectedCalendar: 'Connected Calendar',
    language: 'Language',
    englishLanguage: 'English',
    traditionalChineseHongKongLanguage: 'Traditional Chinese (Hong Kong)',
    privacy: 'Privacy',
    diagnostics: 'Diagnostics',
    mediaRetention: 'Media retention',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    deleteAccount: 'Delete account',
    calendarAndMissions: 'Calendar and missions',
    hiddenCalendarEvents: 'Hidden calendar events',
    notificationStatus: 'Notification status',
    story: 'Story',
    storyStyleProfile: 'Story style profile',
    help: 'Help',
    faq: 'FAQ',
    sendFeedback: 'Send feedback',
    reportProblem: 'Report a problem',
    about: 'About',
    signOut: 'Sign out',
    notifications: 'Notifications',
    enabled: 'Enabled',
    denied: 'Denied',
    notEnabled: 'Not enabled',
    unavailable: 'Unavailable',
    enable: 'Enable notifications',
    openSettings: 'Open system settings',
    calendarConnected: 'Connected',
    calendarPermissionRevoked: 'Calendar permission needs to be restored',
    calendarProviderUnavailable: 'Calendar service is temporarily unavailable',
    calendarDisconnected: 'Disconnected',
    noHiddenCalendarEvents: 'No upcoming hidden events',
    restoreHiddenCalendarEvent: 'Restore',
  }),
  'zh-HK': Object.freeze({
    title: '設定',
    accountAndPreferences: '帳戶與偏好設定',
    trustMode: '信任模式',
    connectedCalendar: '已連接日曆',
    language: '語言',
    englishLanguage: '英文',
    traditionalChineseHongKongLanguage: '繁體中文（香港）',
    privacy: '私隱',
    diagnostics: '診斷資料',
    mediaRetention: '媒體保留',
    privacyPolicy: '私隱政策',
    termsOfService: '服務條款',
    deleteAccount: '刪除帳戶',
    calendarAndMissions: '日曆與任務',
    hiddenCalendarEvents: '已隱藏日曆活動',
    notificationStatus: '通知狀態',
    story: 'Story',
    storyStyleProfile: 'Story 風格設定',
    help: '幫助',
    faq: '常見問題',
    sendFeedback: '傳送意見',
    reportProblem: '回報問題',
    about: '關於',
    signOut: '登出',
    notifications: '通知',
    enabled: '已啟用',
    denied: '已拒絕',
    notEnabled: '尚未啟用',
    unavailable: '無法使用',
    enable: '啟用通知',
    openSettings: '開啟系統設定',
    calendarConnected: '已連接',
    calendarPermissionRevoked: '需要重新授權日曆權限',
    calendarProviderUnavailable: '日曆服務暫時無法使用',
    calendarDisconnected: '已中斷連接',
    noHiddenCalendarEvents: '沒有即將到來的已隱藏活動',
    restoreHiddenCalendarEvent: '還原',
  }),
});

export const calendarConnectionCatalogs = {
  en: {
    directionTitle: 'Choose initial sync',
    externalDirection: 'Sync with external calendar',
    misyraDirection: 'Sync with Misyra',
    initialConfirmation:
      'This can migrate or replace future schedule data. Past data will not be changed.',
    finalConfirmation:
      'Confirm this initial direction. After the initial migration, eligible changes sync both ways.',
    connectionExists: 'A calendar is already connected.',
    continue: 'Continue',
    confirm: 'Confirm',
    back: 'Back',
  },
  'zh-HK': {
    directionTitle: '選擇初始同步方向',
    externalDirection: '與外部日曆同步',
    misyraDirection: '與 Misyra 同步',
    initialConfirmation: '這可能會遷移或取代未來的行程資料。過去的資料不會更改。',
    finalConfirmation: '確認這個初始方向。初始遷移完成後，符合條件的變更會雙向同步。',
    connectionExists: '已有日曆連接。',
    continue: '繼續',
    confirm: '確認',
    back: '返回',
  },
} as const;

export type CalendarConnectionLocale = keyof typeof calendarConnectionCatalogs;
export type CalendarConnectionCatalog = (typeof calendarConnectionCatalogs)[CalendarConnectionLocale];

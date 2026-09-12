import type { LocalizationLocale } from './catalogs.js';

export type CompletionConfirmationCatalog = Readonly<{
  missionComplete: string;
  level: string;
  done: string;
  createStory: string;
}>;

export const completionConfirmationCatalogs: Readonly<
  Record<LocalizationLocale, CompletionConfirmationCatalog>
> = Object.freeze({
  en: Object.freeze({
    missionComplete: 'Mission complete',
    level: 'Level {value}',
    done: 'Done',
    createStory: 'Create Story',
  }),
  'zh-HK': Object.freeze({
    missionComplete: '任務完成',
    level: '等級 {value}',
    done: '完成',
    createStory: '建立 Story',
  }),
});

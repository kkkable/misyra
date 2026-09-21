import type { LocalizationLocale } from './catalogs.js';

export const aiPlannerCatalogs = {
  en: {
    title: 'AI Planner',
    inputLabel: 'What do you want to plan?',
    inputPlaceholder: 'Add plans, times, places, or other details.',
    characterCounter: '{current}/{maximum}',
    attachImages: 'Add images',
    attachedImages: '{current} of {maximum} images attached',
    removeImage: 'Remove image',
    imageLimit: 'You can attach up to three images.',
    pickerFailed: 'Images could not be opened. Try again.',
    uploadFailed: 'An image could not be saved. Try again.',
    saveFailed: 'Your draft could not be saved. Try again.',
    localSaved: 'Draft saved on this device.',
  },
  'zh-HK': {
    title: 'AI 規劃',
    inputLabel: '你想規劃甚麼？',
    inputPlaceholder: '加入行程、時間、地點或其他資料。',
    characterCounter: '{current}/{maximum}',
    attachImages: '加入圖片',
    attachedImages: '已加入 {current}/{maximum} 張圖片',
    removeImage: '移除圖片',
    imageLimit: '最多只可加入三張圖片。',
    pickerFailed: '未能開啟圖片，請再試一次。',
    uploadFailed: '未能儲存其中一張圖片，請再試一次。',
    saveFailed: '未能儲存草稿，請再試一次。',
    localSaved: '草稿已儲存在此裝置。',
  },
} as const satisfies Record<LocalizationLocale, Record<string, string>>;

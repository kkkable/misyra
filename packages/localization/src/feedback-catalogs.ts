import type { LocalizationLocale } from './catalogs.js';

export type FeedbackCatalog = Readonly<{
  sendTitle: string;
  problemTitle: string;
  category: string;
  categoryFeedback: string;
  categoryProblem: string;
  description: string;
  descriptionPlaceholder: string;
  email: string;
  emailPlaceholder: string;
  screenshot: string;
  addScreenshot: string;
  replaceScreenshot: string;
  removeScreenshot: string;
  preview: string;
  previewTitle: string;
  technicalSummaryTitle: string;
  technicalSummaryBody: string;
  retentionDisclosureTitle: string;
  retentionDisclosureBody: string;
  submit: string;
  edit: string;
  success: string;
  done: string;
  submitFailed: string;
}>;

export const feedbackCatalogs: Readonly<
  Record<LocalizationLocale, FeedbackCatalog>
> = Object.freeze({
  en: Object.freeze({
    sendTitle: 'Send feedback',
    problemTitle: 'Report a problem',
    category: 'Category',
    categoryFeedback: 'Feedback',
    categoryProblem: 'Problem',
    description: 'Short description',
    descriptionPlaceholder: 'Tell us what happened or what you would like to share.',
    email: 'Follow-up email (optional)',
    emailPlaceholder: 'Email address',
    screenshot: 'Screenshot (optional)',
    addScreenshot: 'Choose screenshot',
    replaceScreenshot: 'Replace screenshot',
    removeScreenshot: 'Remove screenshot',
    preview: 'Preview',
    previewTitle: 'Review before sending',
    technicalSummaryTitle: 'Technical information included',
    technicalSummaryBody:
      'When available, Misyra includes app/build version, device and OS information, the current screen, error or crash identifiers, network state, and submission time. Raw logs and mission, calendar, AI, evidence, Story, token, and location content are not included automatically.',
    retentionDisclosureTitle: 'Feedback retention',
    retentionDisclosureBody:
      'Submitted feedback, any email you enter, screenshots, and technical information are retained until administrators remove them, including after account deletion. The internal account link is removed after account deletion. Submitted feedback is not used for marketing or AI training.',
    submit: 'Submit',
    edit: 'Edit',
    success: 'Feedback sent. Thank you.',
    done: 'Done',
    submitFailed: 'Couldn’t send. Please try again.',
  }),
  'zh-HK': Object.freeze({
    sendTitle: '傳送意見',
    problemTitle: '回報問題',
    category: '類別',
    categoryFeedback: '意見',
    categoryProblem: '問題',
    description: '簡短描述',
    descriptionPlaceholder: '請告訴我們發生了甚麼，或你想分享的意見。',
    email: '跟進電郵（選填）',
    emailPlaceholder: '電郵地址',
    screenshot: '螢幕截圖（選填）',
    addScreenshot: '選擇螢幕截圖',
    replaceScreenshot: '更換螢幕截圖',
    removeScreenshot: '移除螢幕截圖',
    preview: '預覽',
    previewTitle: '傳送前檢查',
    technicalSummaryTitle: '會包含的技術資料',
    technicalSummaryBody:
      '如資料可用，Misyra 會包含應用程式／版本資料、裝置及作業系統資料、目前畫面、錯誤或崩潰識別碼、網絡狀態及提交時間。系統不會自動包含原始記錄，亦不會自動包含任務、日曆、AI、證據、Story、權杖或位置內容。',
    retentionDisclosureTitle: '意見保留安排',
    retentionDisclosureBody:
      '已提交的意見、你主動填寫的電郵、螢幕截圖及技術資料會保留至管理員移除為止，即使帳戶已刪除亦然。刪除帳戶後，內部帳戶連結會被移除。已提交的意見不會用於市場推廣或 AI 訓練。',
    submit: '提交',
    edit: '編輯',
    success: '意見已傳送。多謝你。',
    done: '完成',
    submitFailed: '未能傳送，請再試一次。',
  }),
});

import type { LocalizationLocale } from './catalogs.js';

export type HelpLegalFaqEntry = Readonly<{
  question: string;
  answer: string;
}>;

export type HelpLegalCatalog = Readonly<{
  faqTitle: string;
  faqIntro: string;
  faqEntries: readonly HelpLegalFaqEntry[];
  privacyTitle: string;
  privacySummary: string;
  privacyFeedbackRetention: string;
  privacyOpenPolicy: string;
  termsTitle: string;
  termsSummary: string;
  termsOpen: string;
  aboutTitle: string;
  aboutBody: string;
  versionLabel: string;
}>;

export const helpLegalCatalogs: Readonly<Record<LocalizationLocale, HelpLegalCatalog>> =
  Object.freeze({
    en: Object.freeze({
      faqTitle: 'FAQ',
      faqIntro: 'Quick answers to common Misyra questions.',
      faqEntries: Object.freeze([
        Object.freeze({
          question: 'How do mission statuses work?',
          answer:
            'Calendar colours are compact status signals. Open Mission Details for written completion and evidence status.',
        }),
        Object.freeze({
          question: 'When can I complete a mission?',
          answer:
            'Completion opens at the scheduled start and expires 30 days after the scheduled finish. Submit evidence before expiry.',
        }),
        Object.freeze({
          question: 'What happens with a connected calendar?',
          answer:
            'Misyra syncs eligible changes with one connected Apple or Google calendar. Completion, evidence, XP, and Story data remain app-only.',
        }),
        Object.freeze({
          question: 'What is included when I send feedback?',
          answer:
            'You choose the description, optional follow-up email, and optional screenshot. Misyra may also include the limited technical details shown before submission.',
        }),
        Object.freeze({
          question: 'How do I recover sign-in access?',
          answer:
            'Your Misyra account stays linked to its original Apple or Google identity. Recover provider access through Apple or Google.',
        }),
      ]),
      privacyTitle: 'Privacy Policy',
      privacySummary:
        'Misyra limits automatic diagnostics and applies the approved retention rules to product data and media.',
      privacyFeedbackRetention:
        'Submitted feedback is an exception to the 30-day product-media policy. Reports, optional email, screenshots, and technical details may be retained indefinitely unless administrators remove them. Account deletion removes the internal account link but keeps the submitted report and any deliberately supplied email. Feedback is not used for marketing or AI training.',
      privacyOpenPolicy: 'Open Privacy Policy',
      termsTitle: 'Terms of Service',
      termsSummary: 'Read the configured Terms of Service for the legal terms that apply to Misyra.',
      termsOpen: 'Open Terms of Service',
      aboutTitle: 'About',
      aboutBody:
        'Misyra is a mobile calendar and mission-completion app for scheduling activities, completing missions, tracking progress, and creating static Story images.',
      versionLabel: 'Version {version}',
    }),
    'zh-HK': Object.freeze({
      faqTitle: '常見問題',
      faqIntro: '以下是 Misyra 常見問題的簡短解答。',
      faqEntries: Object.freeze([
        Object.freeze({
          question: '任務狀態如何顯示？',
          answer: '日曆會以顏色簡潔顯示狀態；開啟「任務詳情」可查看完成及證據狀態的文字說明。',
        }),
        Object.freeze({
          question: '何時可以完成任務？',
          answer: '任務由預定開始時間起可以完成，並於預定結束時間後 30 日到期。證據須在到期前提交。',
        }),
        Object.freeze({
          question: '連接外部日曆後會怎樣？',
          answer:
            'Misyra 會與一個已連接的 Apple 或 Google 日曆同步符合條件的變更；完成、證據、XP 及 Story 資料只由 Misyra 管理。',
        }),
        Object.freeze({
          question: '傳送意見時會包括甚麼？',
          answer:
            '你可自行填寫內容、選擇是否提供跟進電郵，以及是否加入截圖。Misyra 亦可能加入提交前已列明的有限技術資料。',
        }),
        Object.freeze({
          question: '如何恢復登入？',
          answer:
            '你的 Misyra 帳戶會一直連結原本的 Apple 或 Google 身份。如失去存取權，請透過 Apple 或 Google 恢復。',
        }),
      ]),
      privacyTitle: '私隱政策',
      privacySummary: 'Misyra 會限制自動診斷資料，並按已批准的保留規則處理產品資料及媒體。',
      privacyFeedbackRetention:
        '已提交的意見或問題回報不受 30 日產品媒體政策限制。回報、可選電郵、截圖及技術資料可無限期保留，直至管理人員移除。刪除帳戶時會移除內部帳戶連結，但會保留已提交的回報及你主動提供的電郵。這些資料不會用於市場推廣或 AI 訓練。',
      privacyOpenPolicy: '開啟私隱政策',
      termsTitle: '服務條款',
      termsSummary: '請開啟已設定的服務條款，查看適用於 Misyra 的法律條款。',
      termsOpen: '開啟服務條款',
      aboutTitle: '關於',
      aboutBody:
        'Misyra 是流動日曆及任務完成應用程式，可用來安排活動、完成任務、追蹤進度及製作靜態 Story 圖片。',
      versionLabel: '版本 {version}',
    }),
  });

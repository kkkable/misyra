/**
 * Hong Kong Traditional Chinese catalog for the MTS-003 scaffold strings.
 *
 * Copy uses natural Hong Kong written Traditional Chinese. The record type
 * is derived from the English catalog so a missing or extra key fails the
 * strict build.
 */
import type { en } from "./en.js";

export const zhHK: Record<keyof typeof en, string> = {
  "tabs.calendar": "日曆",
  "tabs.aiPlanner": "AI 規劃師",
  "tabs.progress": "進度",
  "tabs.settings": "設定",
  "placeholders.calendar": "日曆畫面正在準備中。",
  "placeholders.aiPlanner": "AI 規劃師畫面正在準備中。",
  "placeholders.progress": "進度畫面正在準備中。",
  "placeholders.settings": "設定畫面正在準備中。",
  "placeholders.evidenceTitle": "證據",
  "placeholders.evidence": "證據畫面正在準備中。",
  "placeholders.storyTitle": "故事",
  "placeholders.story": "故事畫面正在準備中。",
};

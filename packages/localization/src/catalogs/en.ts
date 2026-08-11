/**
 * English catalog for the MTS-003 scaffold strings.
 *
 * Keys are the single source of truth for user-visible copy; the zh-HK
 * catalog is compile-time checked against this key inventory so CI blocks
 * missing keys in either locale (technical specification section 25).
 */
export const en = {
  "tabs.calendar": "Calendar",
  "tabs.aiPlanner": "AI Planner",
  "tabs.progress": "Progress",
  "tabs.settings": "Settings",
  "placeholders.calendar": "The Calendar screen is being prepared.",
  "placeholders.aiPlanner": "The AI Planner screen is being prepared.",
  "placeholders.progress": "The Progress screen is being prepared.",
  "placeholders.settings": "The Settings screen is being prepared.",
  "placeholders.evidenceTitle": "Evidence",
  "placeholders.evidence": "The Evidence screen is being prepared.",
  "placeholders.storyTitle": "Story",
  "placeholders.story": "The Story screen is being prepared.",
} as const;

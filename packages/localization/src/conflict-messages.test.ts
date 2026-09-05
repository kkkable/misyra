import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const requiredConflictKeys = [
  'sync.conflict.missionUpdated',
  'sync.conflict.missionDeleted',
  'sync.conflict.missionCompletedElsewhere',
  'sync.conflict.storyUpdated',
] as const;

function catalog(name: 'en' | 'zh-HK'): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`./locales/${name}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
}

describe('MTS-032 conflict localization', () => {
  it('provides non-empty English and zh-HK catalog entries for every conflict message key', () => {
    const en = catalog('en');
    const zhHK = catalog('zh-HK');

    expect(Object.keys(en).sort()).toEqual(Object.keys(zhHK).sort());
    for (const key of requiredConflictKeys) {
      expect(en[key]).toEqual(expect.any(String));
      expect(String(en[key]).length).toBeGreaterThan(0);
      expect(zhHK[key]).toEqual(expect.any(String));
      expect(String(zhHK[key]).length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { localizationCatalogs } from './catalogs.js';

const requiredConflictKeys = [
  'sync.conflict.missionUpdated',
  'sync.conflict.missionDeleted',
  'sync.conflict.missionCompletedElsewhere',
  'sync.conflict.storyUpdated',
] as const;

describe('MTS-032 conflict localization', () => {
  it('provides non-empty English and zh-HK catalog entries for every conflict message key', () => {
    const en = localizationCatalogs.en;
    const zhHK = localizationCatalogs['zh-HK'];

    expect(Object.keys(en).sort()).toEqual(Object.keys(zhHK).sort());
    for (const key of requiredConflictKeys) {
      expect(en[key]).toEqual(expect.any(String));
      expect(en[key].length).toBeGreaterThan(0);
      expect(zhHK[key]).toEqual(expect.any(String));
      expect(zhHK[key].length).toBeGreaterThan(0);
    }
  });
});

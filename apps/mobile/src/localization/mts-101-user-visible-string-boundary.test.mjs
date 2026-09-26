import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const tabsPath = fileURLToPath(new URL('../../app/(tabs)/_layout.tsx', import.meta.url));
const searchPath = fileURLToPath(new URL('../search/calendar-search-screen.tsx', import.meta.url));

describe('MTS-101 user-visible localization boundary', () => {
  it('sources permanent tab labels from localization catalogs', async () => {
    const source = await readFile(tabsPath, 'utf8');

    for (const literal of [
      "title: 'Calendar'",
      "title: 'AI Planner'",
      "title: 'Progress'",
      "title: 'Settings'",
    ]) {
      expect(source).not.toContain(literal);
    }
    expect(source).toContain('useAppLanguage');
    expect(source).toContain('localizationCatalogs[language]');
    expect(source).toContain('aiPlannerCatalogs[language]');
    expect(source).toContain('progressLocalizationCatalogs[language]');
    expect(source).toContain('notificationSettingsCatalogs[language]');
  });

  it('does not embed English month-name copy in Calendar Search', async () => {
    const source = await readFile(searchPath, 'utf8');

    expect(source).not.toContain('ENGLISH_SHORT_MONTHS');
    expect(source).toContain('Intl.DateTimeFormat');
  });
});

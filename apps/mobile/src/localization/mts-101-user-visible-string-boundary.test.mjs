import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const tabsPath = fileURLToPath(new URL('../../app/(tabs)/_layout.tsx', import.meta.url));
const searchPath = fileURLToPath(new URL('../search/calendar-search-screen.tsx', import.meta.url));
const progressPath = fileURLToPath(new URL('../progress/progress-screen.tsx', import.meta.url));
const completionPath = fileURLToPath(
  new URL('../calendar/completion-confirmation.ts', import.meta.url),
);
const missionDetailsRoutePath = fileURLToPath(
  new URL('../calendar/calendar-mission-details-route.tsx', import.meta.url),
);

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

  it('sources the user-visible XP unit from a localization key', async () => {
    const [progressSource, completionSource, missionDetailsRouteSource] = await Promise.all([
      readFile(progressPath, 'utf8'),
      readFile(completionPath, 'utf8'),
      readFile(missionDetailsRoutePath, 'utf8'),
    ]);

    expect(progressSource).not.toContain('} XP');
    expect(completionSource).not.toContain("'0 XP'");
    expect(completionSource).not.toContain('} XP`');
    expect(missionDetailsRouteSource).not.toContain(')} XP`');

    for (const source of [progressSource, completionSource, missionDetailsRouteSource]) {
      expect(source).toContain("['common.xpUnit']");
    }
  });

  it('formats Mission Details XP with the phone regional locale', async () => {
    const source = await readFile(missionDetailsRoutePath, 'utf8');

    expect(source).toContain('getLocales');
    expect(source).toContain('formatRegionalNumber');
    expect(source).not.toContain('String(completion?.awarded_xp');
  });
});

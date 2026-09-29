import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as localization from '@misyra/localization';

import { resolveHelpLegalConfiguration } from './help-legal-config.js';

const settingsRoutePath = fileURLToPath(new URL('./settings-route.tsx', import.meta.url));
const calendarDayPath = fileURLToPath(
  new URL('../calendar/calendar-day-screen.tsx', import.meta.url),
);

describe('MTS-109 policy URL configuration', () => {
  it('accepts only configured HTTPS legal URLs', () => {
    expect(
      resolveHelpLegalConfiguration({
        privacyPolicyUrl: 'https://example.test/privacy',
        termsOfServiceUrl: 'https://example.test/terms',
      }),
    ).toEqual({
      privacyPolicyUrl: 'https://example.test/privacy',
      termsOfServiceUrl: 'https://example.test/terms',
    });

    expect(
      resolveHelpLegalConfiguration({
        privacyPolicyUrl: 'http://example.test/privacy',
        termsOfServiceUrl: 'mailto:support@example.test',
      }),
    ).toEqual({
      privacyPolicyUrl: null,
      termsOfServiceUrl: null,
    });
  });

  it('uses statically inlinable Expo public env reads and the native installed version', async () => {
    const source = await readFile(settingsRoutePath, 'utf8');

    expect(source).toContain('process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL');
    expect(source).toContain('process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL');
    expect(source).toContain('Application.nativeApplicationVersion');
    expect(source).not.toContain('EXPO_PUBLIC_APP_VERSION');
  });
});

describe('MTS-109 localized Help/legal content', () => {
  it('provides complete English and zh-HK Help/legal catalogs with concise FAQ copy', () => {
    const catalogs = localization.helpLegalCatalogs;
    expect(catalogs).toBeDefined();
    expect(Object.keys(catalogs['zh-HK']).sort()).toEqual(Object.keys(catalogs.en).sort());

    for (const language of ['en', 'zh-HK']) {
      const catalog = catalogs[language];
      expect(catalog.faqEntries.length).toBeGreaterThan(0);
      expect(catalog.faqEntries.length).toBeLessThanOrEqual(5);
      expect(catalog.faqEntries.every((entry) => entry.answer.length <= 260)).toBe(true);
      expect(catalog.privacyFeedbackRetention).toMatch(
        /feedback|意見|回報|保留|retain|account|帳戶/iu,
      );
      expect(JSON.stringify(catalog)).not.toMatch(/mailto:|support@/iu);
    }
  });
});

describe('MTS-109 Help/legal navigation', () => {
  it('renders the approved information panel for FAQ, Privacy Policy, Terms, and About', async () => {
    const source = await readFile(settingsRoutePath, 'utf8');

    expect(source).toContain('SettingsInformationPanel');
    expect(source).toContain("selectedEntry === 'faq'");
    expect(source).toContain("selectedEntry === 'privacy-policy'");
    expect(source).toContain("selectedEntry === 'terms-of-service'");
    expect(source).toContain("selectedEntry === 'about'");
  });

  it('links Calendar contextual help directly to the full FAQ section', async () => {
    const source = await readFile(calendarDayPath, 'utf8');

    expect(source).toContain("params: { section: 'faq' }");
    expect(source).not.toContain("params: { section: 'help' }");
  });
});

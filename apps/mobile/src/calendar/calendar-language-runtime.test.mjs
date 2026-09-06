import { describe, expect, it, vi } from 'vitest';

import {
  resolveCalendarLanguage,
  resolveInitialCalendarLanguage,
} from './calendar-language-runtime.js';

describe('Calendar language runtime', () => {
  it('uses supported Traditional Chinese from the phone only as the first-launch fallback', () => {
    expect(
      resolveInitialCalendarLanguage({
        languageCode: 'zh',
        languageScriptCode: 'Hant',
        regionCode: 'HK',
      }),
    ).toBe('zh-HK');
    expect(
      resolveInitialCalendarLanguage({
        languageCode: 'zh',
        languageScriptCode: 'Hans',
        regionCode: 'CN',
      }),
    ).toBe('en');
  });

  it('prefers persisted account language over a different phone language', async () => {
    const readSettings = vi.fn(() => Promise.resolve({ language: 'en' }));
    const result = await resolveCalendarLanguage({
      deviceLocale: {
        languageCode: 'zh',
        languageScriptCode: 'Hant',
        regionCode: 'HK',
      },
      readSession: () => Promise.resolve({ accountId: 'account-a' }),
      readSettings,
    });

    expect(result).toEqual({ language: 'en', persisted: true });
    expect(readSettings).toHaveBeenCalledWith('account-a');
  });

  it('keeps first-launch phone language when account settings are not available yet', async () => {
    const result = await resolveCalendarLanguage({
      deviceLocale: {
        languageCode: 'zh',
        languageScriptCode: 'Hant',
        regionCode: 'HK',
      },
      readSession: () => Promise.resolve({ accountId: 'account-a' }),
      readSettings: () => Promise.resolve(null),
    });

    expect(result).toEqual({ language: 'zh-HK', persisted: false });
  });
});

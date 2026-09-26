import { describe, expect, it } from 'vitest';

import { localizationCatalogs, notificationSettingsCatalogs } from './index.js';
import * as localization from './index.js';

type DeviceLocale = Readonly<{
  languageCode: string | null;
  languageScriptCode: string | null;
  regionCode?: string | null;
}>;

type LocaleResolver = (locale: DeviceLocale | undefined) => 'en' | 'zh-HK';
type DateFormatter = (value: Date, language: 'en' | 'zh-HK') => string;
type NumberFormatter = (value: number, regionalLocale: string) => string;

function requiredExport<T extends (...args: never[]) => unknown>(name: string): T {
  const value = (localization as Record<string, unknown>)[name];
  expect(typeof value, `missing localization export ${name}`).toBe('function');
  return value as T;
}

describe('MTS-101 localization catalogs', () => {
  it('keeps every runtime English key present in zh-HK and vice versa', () => {
    expect(Object.keys(localizationCatalogs['zh-HK']).sort()).toEqual(
      Object.keys(localizationCatalogs.en).sort(),
    );
    expect(Object.keys(notificationSettingsCatalogs['zh-HK']).sort()).toEqual(
      Object.keys(notificationSettingsCatalogs.en).sort(),
    );
  });
});

describe('MTS-101 locale resolution', () => {
  it('maps supported Traditional Chinese to zh-HK and unsupported languages to English', () => {
    const resolve = requiredExport<LocaleResolver>('resolveLocalizationLocale');

    expect(
      resolve({ languageCode: 'zh', languageScriptCode: 'Hant', regionCode: 'HK' }),
    ).toBe('zh-HK');
    expect(
      resolve({ languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'CN' }),
    ).toBe('en');
    expect(resolve({ languageCode: 'fr', languageScriptCode: null, regionCode: 'FR' })).toBe('en');
    expect(resolve(undefined)).toBe('en');
  });
});

describe('MTS-101 regional formatting', () => {
  const date = new Date('2026-09-01T12:00:00.000Z');

  it('formats month and weekday names from app language', () => {
    const formatMonth = requiredExport<DateFormatter>('formatAppMonth');
    const formatWeekday = requiredExport<DateFormatter>('formatAppWeekday');

    expect(formatMonth(date, 'en')).toMatch(/September/i);
    expect(formatMonth(date, 'zh-HK')).toContain('9月');
    expect(formatWeekday(date, 'en')).toMatch(/Tue/i);
    expect(formatWeekday(date, 'zh-HK')).toMatch(/二|週二|星期二/);
  });

  it('formats numeric values from the phone regional locale rather than app language', () => {
    const formatNumber = requiredExport<NumberFormatter>('formatRegionalNumber');

    expect(formatNumber(12345.6, 'en-US')).toBe('12,345.6');
    expect(formatNumber(12345.6, 'de-DE')).toBe('12.345,6');
  });
});

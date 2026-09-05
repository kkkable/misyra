import { describe, expect, it } from 'vitest';

import { authMessagesForLocale, resolveAuthLocale } from './auth-messages.js';

describe('MTS-035 localized authentication copy', () => {
  it('uses Hong Kong Traditional Chinese for supported Traditional Chinese phone languages', () => {
    expect(resolveAuthLocale({ languageCode: 'zh', languageScriptCode: 'Hant' })).toBe('zh-HK');
    expect(resolveAuthLocale({ languageCode: 'zh', languageScriptCode: null })).toBe('en');
    expect(resolveAuthLocale({ languageCode: 'en', languageScriptCode: null })).toBe('en');
  });

  it('sources provider entry and nontechnical failure copy from the launch locale catalog', () => {
    expect(authMessagesForLocale('en')).toEqual({
      title: 'Sign in to Misyra',
      apple: 'Continue with Apple',
      google: 'Continue with Google',
      signInFailed: 'Sign-in failed. Please try again.',
    });
    expect(authMessagesForLocale('zh-HK')).toEqual({
      title: '登入 Misyra',
      apple: '使用 Apple 繼續',
      google: '使用 Google 繼續',
      signInFailed: '登入失敗，請再試一次。',
    });
  });
});

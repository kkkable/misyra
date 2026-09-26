import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('./settings-route.tsx', import.meta.url));
const languageRuntimePath = fileURLToPath(
  new URL('../localization/app-language-runtime.ts', import.meta.url),
);

describe('MTS-101 manual app-language setting', () => {
  it('offers exactly English and zh-HK choices from Settings → Language', async () => {
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain('settings-language-option-en');
    expect(source).toContain('settings-language-option-zh-HK');
    expect(source).toContain("focusEntry('language')");
  });

  it('persists the selected language and publishes it immediately to mounted app surfaces', async () => {
    const [routeSource, languageRuntimeSource] = await Promise.all([
      readFile(routePath, 'utf8'),
      readFile(languageRuntimePath, 'utf8'),
    ]);

    expect(routeSource).toMatch(/updateAccountSettings\(\{\s*language/u);
    expect(routeSource).toContain('publishAppLanguage(');
    expect(languageRuntimeSource).toContain('export function publishAppLanguage');
  });
});

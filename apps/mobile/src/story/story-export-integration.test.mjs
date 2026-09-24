import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const editorPath = fileURLToPath(new URL('./story-editor-screen.tsx', import.meta.url));
const routePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));
const runtimePath = fileURLToPath(new URL('./expo-story-export-platform.ts', import.meta.url));
const localizationPath = fileURLToPath(
  new URL('../../../../packages/localization/src/catalogs.ts', import.meta.url),
);
const appConfigPath = fileURLToPath(new URL('../../app.config.ts', import.meta.url));
const deviceScriptUrl = new URL(
  '../../scripts/mts-097-story-export-device-check.mjs',
  import.meta.url,
);

async function readRequiredFile(path, label) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label} is missing`);
  }
}

describe('MTS-097 Story export production wiring', () => {
  it('adds direct save/share editor actions and saved confirmation', async () => {
    const editor = await readRequiredFile(editorPath, 'Story editor');

    expect(editor).toMatch(/onSaveToPhotos/);
    expect(editor).toMatch(/onShareElsewhere/);
    expect(editor).toMatch(/story-save-to-photos/);
    expect(editor).toMatch(/story-share-elsewhere/);
    expect(editor).toMatch(/story-saved-to-photos/);
    expect(editor).toMatch(/savedToPhotosMessage/);
    expect(editor).not.toMatch(/Alert\.alert|confirm\s*\(/);
  });

  it('wires the active retained version to the local export controller', async () => {
    const route = await readRequiredFile(routePath, 'Story route');

    expect(route).toMatch(/createStoryExportController/);
    expect(route).toMatch(/createExpoStoryExportPlatform/);
    expect(route).toMatch(/imageVersionId:\s*editorState\.imageVersionId/);
    expect(route).toMatch(/sourceImage:\s*editorState\.sourceImage/);
    expect(route).toMatch(/composition:\s*activeComposition\(editorState\)/);
    expect(route).toMatch(/\.saveToPhotos\(/);
    expect(route).toMatch(/\.share\(/);
  });

  it('renders and hands off the PNG locally without a Story API call', async () => {
    const runtime = await readRequiredFile(runtimePath, 'Story export platform');

    expect(runtime).toMatch(/@shopify\/react-native-skia/);
    expect(runtime).toMatch(/STORY_EXPORT_WIDTH/);
    expect(runtime).toMatch(/STORY_EXPORT_HEIGHT/);
    expect(runtime).toMatch(/requestPermissionsAsync\(true,\s*\[\]\)/);
    expect(runtime).toMatch(/Asset\.create/);
    expect(runtime).toMatch(/shareAsync/);
    expect(runtime).not.toMatch(/\bfetch\s*\(|\/v1\/|https?:\/\//);
  });

  it('localizes the saved message and uses Story-aware permission copy', async () => {
    const [localization, appConfig] = await Promise.all([
      readRequiredFile(localizationPath, 'Localization catalog'),
      readRequiredFile(appConfigPath, 'Expo app config'),
    ]);

    expect(localization).toContain("'story.editor.savedToPhotos': 'Saved to Photos.'");
    expect(localization).toContain("'story.editor.saveToPhotos': 'Save to Photos'");
    expect(localization).toContain("'story.editor.shareElsewhere': 'Share elsewhere'");
    expect(appConfig).toMatch(/savePhotosPermission:[\s\S]{0,180}Story/i);
  });

  it('provides a 1080x1920 physical-device save/share recorder', async () => {
    const scriptPath = fileURLToPath(deviceScriptUrl);
    const scriptSource = await readRequiredFile(scriptPath, 'MTS-097 device recorder');

    expect(scriptSource).toMatch(/1080/);
    expect(scriptSource).toMatch(/1920/);

    const module = await import(deviceScriptUrl.href);
    const record = module.buildStoryExportDeviceRecord({
      device: 'Pixel test device',
      platform: 'android',
      imageVersionId: 'generated-one',
      width: 1080,
      height: 1920,
      savedToPhotos: true,
      systemShareOpened: true,
      notes: 'Save and native share both observed.',
    });

    expect(record).toMatchObject({
      device: 'Pixel test device',
      platform: 'android',
      imageVersionId: 'generated-one',
      width: 1080,
      height: 1920,
      savedToPhotos: true,
      systemShareOpened: true,
      notes: 'Save and native share both observed.',
    });
    expect(record.recordedAt).toEqual(expect.any(String));
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const storyRoutePath = fileURLToPath(new URL('../../app/story.tsx', import.meta.url));
const setupRoutePath = fileURLToPath(new URL('../../app/story-style-profile.tsx', import.meta.url));
const pickerPath = fileURLToPath(new URL('./story-style-profile-reference-picker.ts', import.meta.url));
const mediaApiPath = fileURLToPath(new URL('./story-style-profile-media-api.ts', import.meta.url));
const settingsPath = fileURLToPath(new URL('../settings/settings-route.tsx', import.meta.url));

describe('MTS-093 Story style-profile mobile integration', () => {
  it('uses the system image picker for 3-8 references without broad media-library permission', () => {
    const picker = readFileSync(pickerPath, 'utf8');
    const setup = readFileSync(setupRoutePath, 'utf8');

    expect(picker).toMatch(/File\.pickFileAsync/);
    expect(picker).toMatch(/multipleFiles:\s*true/);
    expect(picker).toMatch(/mimeTypes:\s*\['image\/\*'\]/);
    expect(setup).not.toMatch(/requestMediaLibraryPermissions|expo-media-library|expo-camera/i);
  });

  it('uploads references only through the protected style-references media purpose', () => {
    const mediaApi = readFileSync(mediaApiPath, 'utf8');

    expect(mediaApi).toMatch(/purpose:\s*'style-references'/);
    expect(mediaApi).toMatch(/variant:\s*'original'/);
    expect(mediaApi).toMatch(/upload-authorizations/);
  });

  it('gates only a new first Story and leaves an existing draft independent from later profile changes', () => {
    const story = readFileSync(storyRoutePath, 'utf8');

    expect(story).toMatch(/store\.load\(occurrenceId\)/);
    expect(story).toMatch(/styleProfile\.getStatus\(\)/);
    expect(story).toMatch(/mode === 'unset'/);
    expect(story).toMatch(/story-style-profile/);
    expect(story.indexOf('store.load(occurrenceId)')).toBeLessThan(
      story.indexOf('styleProfile.getStatus()'),
    );
  });

  it('exposes Story style-profile management from Settings with rebuild and reset-default actions', () => {
    const settings = readFileSync(settingsPath, 'utf8');
    const setup = readFileSync(setupRoutePath, 'utf8');

    expect(settings).toMatch(/story-style-profile/);
    expect(settings).toMatch(/Story style profile|story\.styleProfile/i);
    expect(setup).toMatch(/\.rebuild\(/);
    expect(setup).toMatch(/\.useDefault\(/);
  });
});

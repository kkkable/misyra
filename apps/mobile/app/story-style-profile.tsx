import { useEffect, useState } from 'react';

import { space, typography } from '@misyra/design-tokens';
import { localizationCatalogs } from '@misyra/localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../src/design-system/index.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';
import { createStoryStyleProfileApi } from '../src/story/story-style-profile-api.js';
import { createStoryStyleProfileMediaApi } from '../src/story/story-style-profile-media-api.js';
import {
  pickStoryStyleReferenceImages,
  type StoryStyleReferenceImage,
} from '../src/story/story-style-profile-reference-picker.js';

const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

function routeOccurrenceId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export default function StoryStyleProfileRoute() {
  const params = useLocalSearchParams<{ occurrenceId?: string | string[] }>();
  const occurrenceId = routeOccurrenceId(params.occurrenceId);
  const firstStory = occurrenceId !== null;
  const router = useRouter();
  const language = useAppLanguage();
  const catalog = localizationCatalogs[language];
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const [references, setReferences] = useState<readonly StoryStyleReferenceImage[]>([]);
  const [status, setStatus] = useState<'unset' | 'default' | 'custom'>('unset');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    if (occurrenceId === null) {
      router.back();
      return;
    }
    router.replace({ pathname: '/story', params: { occurrenceId } });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in') return;
      const api = createStoryStyleProfileApi({
        baseUrl: getAuthApiBaseUrl(),
        accessToken: authState.session.accessToken,
      });
      const current = await api.getStatus();
      if (!cancelled) setStatus(current.mode);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseReferences = async () => {
    setError(null);
    const selected = await pickStoryStyleReferenceImages();
    if (selected.length === 0) return;
    if (selected.length < 3 || selected.length > 8) {
      setError(catalog['story.styleProfile.referenceLimit']);
      return;
    }
    setReferences(selected);
  };

  const rebuild = async () => {
    if (references.length < 3 || references.length > 8) {
      setError(catalog['story.styleProfile.referenceLimit']);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in') throw new Error('story_style_profile_requires_sign_in');
      const options = {
        baseUrl: getAuthApiBaseUrl(),
        accessToken: authState.session.accessToken,
      };
      const media = createStoryStyleProfileMediaApi(options);
      const styleProfile = createStoryStyleProfileApi(options);
      const assetIds = references.map(() => generateUuid());
      await Promise.all(
        references.map((image, index) => media.uploadOriginal(assetIds[index] ?? '', image)),
      );
      await styleProfile.rebuild(assetIds);
      setStatus('custom');
      finish();
    } catch {
      setError(catalog['story.styleProfile.networkRequired']);
    } finally {
      setBusy(false);
    }
  };

  const useDefault = async () => {
    setBusy(true);
    setError(null);
    try {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in') throw new Error('story_style_profile_requires_sign_in');
      const styleProfile = createStoryStyleProfileApi({
        baseUrl: getAuthApiBaseUrl(),
        accessToken: authState.session.accessToken,
      });
      await styleProfile.useDefault();
      setStatus('default');
      finish();
    } catch {
      setError(catalog['story.styleProfile.networkRequired']);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    status === 'custom'
      ? catalog['story.styleProfile.statusCustom']
      : status === 'default'
        ? catalog['story.styleProfile.statusDefault']
        : catalog['story.styleProfile.statusUnset'];

  return (
    <Screen colorScheme={colorScheme} testID="story-style-profile">
      <TopBar colorScheme={colorScheme} title={catalog['story.styleProfile.title']} />
      <View style={styles.content}>
        <Text allowFontScaling style={[styles.status, { color: colors.textSecondary }]}>
          {statusLabel}
        </Text>
        <Text allowFontScaling style={[styles.body, { color: colors.textPrimary }]}>
          {catalog['story.styleProfile.body']}
        </Text>
        <PrimaryButton
          accessibilityLabel={
            firstStory
              ? catalog['story.styleProfile.setup']
              : catalog['story.styleProfile.replaceReferences']
          }
          colorScheme={colorScheme}
          disabled={busy}
          label={
            firstStory
              ? catalog['story.styleProfile.setup']
              : catalog['story.styleProfile.replaceReferences']
          }
          onPress={() => {
            void chooseReferences();
          }}
          testID="story-style-profile-choose"
        />
        {references.length === 0 ? null : (
          <>
            <Text allowFontScaling style={[styles.status, { color: colors.textSecondary }]}>
              {catalog['story.styleProfile.selectedCount'].replace(
                '{count}',
                String(references.length),
              )}
            </Text>
            <PrimaryButton
              accessibilityLabel={catalog['story.styleProfile.rebuild']}
              colorScheme={colorScheme}
              label={catalog['story.styleProfile.rebuild']}
              loading={busy}
              onPress={() => {
                void rebuild();
              }}
              testID="story-style-profile-rebuild"
            />
          </>
        )}
        <SecondaryButton
          accessibilityLabel={
            firstStory
              ? catalog['story.styleProfile.useDefault']
              : catalog['story.styleProfile.resetDefault']
          }
          colorScheme={colorScheme}
          disabled={busy}
          label={
            firstStory
              ? catalog['story.styleProfile.useDefault']
              : catalog['story.styleProfile.resetDefault']
          }
          onPress={() => {
            void useDefault();
          }}
          testID="story-style-profile-default"
        />
        {error === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            allowFontScaling
            style={[styles.error, { color: colors.destructive }]}
          >
            {error}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingVertical: space[4],
  },
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  status: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  error: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
});

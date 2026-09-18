import { useMemo } from 'react';
import { localizationCatalogs } from '@misyra/localization';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import {
  EvidenceCaptureScreen,
  type EvidenceCaptureMessages,
} from '../src/evidence/evidence-capture-screen.js';
import { createExpoEvidenceCaptureRuntime } from '../src/evidence/expo-evidence-capture-runtime.js';
import type { ColorScheme } from '../src/design-system/index.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';

export default function EvidenceRoute() {
  const router = useRouter();
  const language = useAppLanguage();
  const catalog = localizationCatalogs[language];
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const runtime = useMemo(() => createExpoEvidenceCaptureRuntime(), []);
  const messages: EvidenceCaptureMessages = {
    close: catalog['evidence.close'],
    permissionTitle: catalog['evidence.permission.title'],
    permissionBody: catalog['evidence.permission.body'],
    openSettings: catalog['evidence.permission.openSettings'],
    capture: catalog['evidence.capture'],
    retake: catalog['evidence.retake'],
    submit: catalog['evidence.submit'],
    captureFailed: catalog['evidence.captureFailed'],
  };

  return (
    <EvidenceCaptureScreen
      colorScheme={colorScheme}
      messages={messages}
      runtime={runtime}
      onClose={() => {
        router.back();
      }}
      onSubmit={() => {
        router.back();
      }}
    />
  );
}

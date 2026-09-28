import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import { createFeedbackApi } from '../src/feedback/feedback-api.js';
import type { FeedbackCategory } from '../src/feedback/feedback-form.js';
import { FeedbackFormScreen } from '../src/feedback/feedback-form-screen.js';
import {
  removeFeedbackScreenshotFile,
  transcodeFeedbackScreenshotToPng,
} from '../src/feedback/feedback-screenshot-platform.js';
import { sanitizeFeedbackScreenshot } from '../src/feedback/feedback-screenshot.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';

function routeCategory(value: string | string[] | undefined): FeedbackCategory {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'problem' ? 'problem' : 'feedback';
}

export default function FeedbackRoute() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const category = routeCategory(params.category);
  const router = useRouter();
  const language = useAppLanguage();

  const pickScreenshot = async () => {
    const result = await File.pickFileAsync({
      multipleFiles: false,
      mimeTypes: ['image/*'],
    });
    if (result.canceled) return null;
    const selected = Array.isArray(result.result) ? result.result[0] : result.result;
    if (selected === undefined) return null;
    return sanitizeFeedbackScreenshot(
      {
        uri: selected.uri,
        mimeType: typeof selected.type === 'string' && selected.type.length > 0 ? selected.type : null,
        name: typeof selected.name === 'string' && selected.name.length > 0 ? selected.name : null,
      },
      transcodeFeedbackScreenshotToPng,
    );
  };

  return (
    <FeedbackFormScreen
      initialCategory={category}
      language={language}
      onDone={() => {
        router.back();
      }}
      onPickScreenshot={pickScreenshot}
      onRemoveScreenshot={(screenshot) => removeFeedbackScreenshotFile(screenshot.uri)}
      onSubmit={async (payload) => {
        const authState = await rootAuthController.restore();
        if (authState.status !== 'signed_in') throw new Error('feedback_requires_sign_in');
        const api = createFeedbackApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        await api.submit(payload);
      }}
      technicalDetails={{ screenName: 'feedback' }}
    />
  );
}

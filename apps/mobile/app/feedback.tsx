import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import { createFeedbackApi } from '../src/feedback/feedback-api.js';
import {
  createFeedbackDraftStore,
  type FeedbackDraftStore,
} from '../src/feedback/feedback-draft-store.js';
import type { FeedbackCategory, FeedbackFormDraft } from '../src/feedback/feedback-form.js';
import { FeedbackFormScreen } from '../src/feedback/feedback-form-screen.js';
import type {
  FeedbackSubmissionPayload,
  FeedbackTechnicalDetails,
} from '../src/feedback/feedback-payload.js';
import {
  removeFeedbackScreenshotFile,
  transcodeFeedbackScreenshotToPng,
} from '../src/feedback/feedback-screenshot-platform.js';
import { sanitizeFeedbackScreenshot } from '../src/feedback/feedback-screenshot.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';
import { openMobileDatabase } from '../src/storage/database.js';

function routeCategory(value: string | string[] | undefined): FeedbackCategory {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'problem' ? 'problem' : 'feedback';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function selectedFeedbackImage(value: unknown): Readonly<{
  uri: string;
  mimeType: string | null;
  name: string | null;
}> | null {
  if (!isRecord(value) || value.canceled === true) return null;
  const rawResult = value.result;
  const candidate: unknown = Array.isArray(rawResult) ? rawResult[0] : rawResult;
  if (!isRecord(candidate) || typeof candidate.uri !== 'string' || candidate.uri.length === 0) {
    return null;
  }
  return {
    uri: candidate.uri,
    mimeType:
      typeof candidate.type === 'string' && candidate.type.length > 0 ? candidate.type : null,
    name: typeof candidate.name === 'string' && candidate.name.length > 0 ? candidate.name : null,
  };
}

type FeedbackDraftRuntime = Readonly<{
  store: FeedbackDraftStore;
  initialDraft: FeedbackFormDraft | null;
  technicalDetails: FeedbackTechnicalDetails;
}>;

function draftFromPayload(payload: FeedbackSubmissionPayload): FeedbackFormDraft {
  return Object.freeze({
    category: payload.category,
    description: payload.description,
    email: payload.email ?? '',
    screenshot: payload.screenshot,
  });
}

export default function FeedbackRoute() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const category = routeCategory(params.category);
  const router = useRouter();
  const language = useAppLanguage();
  const [draftRuntime, setDraftRuntime] = useState<FeedbackDraftRuntime | null>(null);

  useEffect(() => {
    const lifecycle = { active: true };

    void (async () => {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in') {
        if (lifecycle.active) router.back();
        return;
      }
      const database = await openMobileDatabase();
      const store = createFeedbackDraftStore({
        database,
        accountId: authState.session.accountId,
        removeScreenshot: removeFeedbackScreenshotFile,
      });
      const persisted = await store.load();
      if (!lifecycle.active) return;
      setDraftRuntime(
        Object.freeze({
          store,
          initialDraft: persisted?.draft ?? null,
          technicalDetails:
            persisted?.technicalDetails ?? Object.freeze({ screenName: 'feedback' }),
        }),
      );
    })().catch(() => {
      if (lifecycle.active) router.back();
    });

    return () => {
      lifecycle.active = false;
    };
  }, [router]);

  const pickScreenshot = async () => {
    const pickerResult = (await File.pickFileAsync({
      multipleFiles: false,
      mimeTypes: ['image/*'],
    })) as unknown;
    const selected = selectedFeedbackImage(pickerResult);
    if (selected === null) return null;
    return sanitizeFeedbackScreenshot(selected, transcodeFeedbackScreenshotToPng);
  };

  if (draftRuntime === null) return null;

  return (
    <FeedbackFormScreen
      initialCategory={category}
      {...(draftRuntime.initialDraft === null ? {} : { initialDraft: draftRuntime.initialDraft })}
      language={language}
      onDiscardDraft={() => draftRuntime.store.discard()}
      onDone={() => {
        router.back();
      }}
      onDraftChange={(draft) =>
        draftRuntime.store.save({
          draft,
          technicalDetails: draftRuntime.technicalDetails,
        })
      }
      onPickScreenshot={pickScreenshot}
      onRemoveScreenshot={(screenshot) => removeFeedbackScreenshotFile(screenshot.uri)}
      onSubmit={async (payload) => {
        const authState = await rootAuthController.restore();
        if (authState.status !== 'signed_in') {
          throw new Error('feedback_requires_sign_in');
        }
        const api = createFeedbackApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        try {
          await api.submit(payload);
          await draftRuntime.store.discard();
        } catch (error) {
          await draftRuntime.store.save({
            draft: draftFromPayload(payload),
            technicalDetails: payload.technicalDetails,
          });
          throw error;
        }
      }}
      technicalDetails={draftRuntime.technicalDetails}
    />
  );
}

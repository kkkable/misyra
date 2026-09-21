import { useCallback, useEffect, useMemo, useState } from 'react';
import { localizationCatalogs } from '@misyra/localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import type { ColorScheme } from '../src/design-system/index.js';
import { createEvidenceApi, type EvidenceAttemptResult } from '../src/evidence/evidence-api.js';
import {
  createEvidenceOfflineQueue,
  type OfflineEvidencePending,
} from '../src/evidence/evidence-offline-queue.js';
import {
  EvidenceCaptureScreen,
  type EvidenceCaptureMessages,
} from '../src/evidence/evidence-capture-screen.js';
import { createExpoEvidenceCaptureRuntime } from '../src/evidence/expo-evidence-capture-runtime.js';
import { createEvidenceMediaActions } from '../src/evidence/evidence-media-actions.js';
import {
  bindEvidenceOriginalToAttempt,
  createExpoEvidenceMediaActionsRuntime,
} from '../src/evidence/expo-evidence-media-actions-runtime.js';
import {
  resolveEvidenceResultFlow,
  resolveEvidenceResultRefreshDelay,
} from '../src/evidence/evidence-result-flow.js';
import { createEvidenceSubmissionSession } from '../src/evidence/evidence-submission-session.js';
import {
  EvidenceResultPanel,
  type EvidenceResultMessages,
} from '../src/evidence/evidence-result-panel.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';
import { openMobileDatabase } from '../src/storage/database.js';
import { createAuthenticatedSyncApi } from '../src/sync/authenticated-sync-api.js';
import { requireRegisteredDeviceId, rootSyncRuntime } from '../src/sync/root-sync-runtime.js';

const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';
const RESULT_POLL_MILLISECONDS = 1_000;

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

export default function EvidenceRoute() {
  const params = useLocalSearchParams<{ occurrenceId?: string | string[] }>();
  const router = useRouter();
  const occurrenceId = routeOccurrenceId(params.occurrenceId);
  const language = useAppLanguage();
  const catalog = localizationCatalogs[language];
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const runtime = useMemo(() => createExpoEvidenceCaptureRuntime(), []);
  const submissionSession = useMemo(() => createEvidenceSubmissionSession(generateUuid), []);
  const [result, setResult] = useState<EvidenceAttemptResult | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [pollRetry, setPollRetry] = useState(0);
  const [restoringLatest, setRestoringLatest] = useState(true);
  const [offlinePending, setOfflinePending] = useState<OfflineEvidencePending | null>(null);

  const captureMessages: EvidenceCaptureMessages = {
    close: catalog['evidence.close'],
    permissionTitle: catalog['evidence.permission.title'],
    permissionBody: catalog['evidence.permission.body'],
    openSettings: catalog['evidence.permission.openSettings'],
    capture: catalog['evidence.capture'],
    retake: catalog['evidence.retake'],
    submit: catalog['evidence.submit'],
    captureFailed: catalog['evidence.captureFailed'],
  };
  const resultMessages: EvidenceResultMessages = {
    waiting: catalog['evidence.result.waiting'],
    accepted: catalog['evidence.result.accepted'],
    rejected: catalog['evidence.result.rejected'],
    expired: catalog['evidence.result.expired'],
    tryAnotherPhoto: catalog['evidence.result.tryAnotherPhoto'],
    selfConfirm: catalog['evidence.result.selfConfirm'],
    selfConfirmPrompt: catalog['evidence.result.selfConfirmPrompt'],
    confirmSelfCompletion: catalog['evidence.result.confirmSelfCompletion'],
    cancel: catalog['evidence.result.cancel'],
    close: catalog['evidence.close'],
    remainingAttempts: catalog['evidence.result.remainingAttempts'],
    reasonTaskMismatch: catalog['evidence.result.reason.taskMismatch'],
    reasonTaskNotEvident: catalog['evidence.result.reason.taskNotEvident'],
    reasonImageUnusable: catalog['evidence.result.reason.imageUnusable'],
    saveToPhotos: catalog['evidence.media.saveToPhotos'],
    deleteEvidence: catalog['evidence.media.delete'],
  };

  const authenticatedEvidenceApi = useCallback(async () => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('evidence_requires_sign_in');
    return {
      accountId: authState.session.accountId,
      api: createEvidenceApi({
        baseUrl: getAuthApiBaseUrl(),
        accessToken: authState.session.accessToken,
      }),
    };
  }, []);

  const authenticatedEvidenceMediaActions = useCallback(async () => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('evidence_requires_sign_in');
    return createEvidenceMediaActions(
      createExpoEvidenceMediaActionsRuntime({
        baseUrl: getAuthApiBaseUrl(),
        accessToken: authState.session.accessToken,
      }),
    );
  }, []);

  const authenticatedEvidenceQueue = useCallback(async () => {
    const { accountId, api } = await authenticatedEvidenceApi();
    const [database, deviceId] = await Promise.all([
      openMobileDatabase(),
      requireRegisteredDeviceId(accountId),
    ]);
    return {
      api,
      queue: createEvidenceOfflineQueue({
        database,
        accountId,
        deviceId,
        api,
        files: runtime.files,
      }),
    };
  }, [authenticatedEvidenceApi, runtime]);

  const refreshResult = useCallback(async () => {
    if (activeAttemptId === null) return;
    const { api } = await authenticatedEvidenceApi();
    setResult(await api.getResult(activeAttemptId));
  }, [activeAttemptId, authenticatedEvidenceApi]);

  useEffect(() => {
    if (occurrenceId === null) {
      setRestoringLatest(false);
      return;
    }

    const lifecycle = { cancelled: false };
    const isCancelled = () => lifecycle.cancelled;
    const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
    submissionSession.reset();
    setResult(null);
    setActiveAttemptId(null);
    setOfflinePending(null);
    setRestoringLatest(true);

    const restore = async () => {
      try {
        const { api, queue } = await authenticatedEvidenceQueue();
        const pending = await queue.getPendingForOccurrence(occurrenceId);
        if (isCancelled()) return;
        if (pending !== null) {
          setActiveAttemptId(pending.attemptId);
          setOfflinePending(pending);
          setRestoringLatest(false);
          void queue
            .processPending()
            .then(() => api.getResult(pending.attemptId))
            .then((latestResult) => {
              if (isCancelled()) return;
              setResult(latestResult);
              setOfflinePending(null);
            })
            .catch(() => undefined);
          return;
        }

        const latestAttemptId = await api.getLatestAttemptId(occurrenceId);
        if (isCancelled()) return;
        if (latestAttemptId !== null) {
          const latestResult = await api.getResult(latestAttemptId);
          if (isCancelled()) return;
          setActiveAttemptId(latestAttemptId);
          setResult(latestResult);
        }
        setRestoringLatest(false);
      } catch {
        if (!isCancelled()) {
          retryTimer.current = setTimeout(() => {
            void restore();
          }, RESULT_POLL_MILLISECONDS);
        }
      }
    };

    void restore();
    return () => {
      lifecycle.cancelled = true;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [authenticatedEvidenceQueue, occurrenceId, submissionSession]);

  useEffect(() => {
    if (result === null) return;
    const delay = resolveEvidenceResultRefreshDelay(result);
    if (delay === null) return;

    const timer = setTimeout(() => {
      void refreshResult().catch(() => {
        setPollRetry((value) => value + 1);
      });
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [pollRetry, refreshResult, result]);

  useEffect(() => {
    if (result?.verificationStatus === 'accepted') {
      void rootSyncRuntime.run().catch(() => undefined);
    }
  }, [result?.verificationStatus]);

  const close = useCallback(() => {
    router.back();
  }, [router]);

  if (occurrenceId === null) {
    close();
    return null;
  }

  if (restoringLatest) return null;

  if (offlinePending !== null && result === null) {
    return (
      <EvidenceResultPanel
        colorScheme={colorScheme}
        flow={{
          state: 'waiting',
          remainingAttempts: 0,
          canRetry: false,
          canSelfConfirm: false,
          reasonMessageKey: null,
        }}
        messages={resultMessages}
        onClose={close}
        onRetry={() => undefined}
        onSelfConfirm={() => Promise.resolve()}
      />
    );
  }

  if (result === null) {
    return (
      <EvidenceCaptureScreen
        colorScheme={colorScheme}
        messages={captureMessages}
        runtime={runtime}
        onClose={close}
        onSubmit={async (file) => {
          const { api, queue } = await authenticatedEvidenceQueue();
          const submission = submissionSession.getOrCreate();
          const protectedOriginalUri = await bindEvidenceOriginalToAttempt(
            submission.attemptId,
            file.uri,
          );
          const pending: OfflineEvidencePending = {
            mutationId: generateUuid(),
            attemptId: submission.attemptId,
            occurrenceId,
            submittedAt: submission.submittedAt,
            originalUri: protectedOriginalUri,
            thumbnailUris: [],
          };
          await queue.enqueue(pending);
          setActiveAttemptId(submission.attemptId);
          setOfflinePending(pending);
          setResult(null);

          void queue
            .processPending()
            .then(() => api.getResult(submission.attemptId))
            .then((latestResult) => {
              setResult(latestResult);
              setOfflinePending(null);
            })
            .catch(() => undefined);
        }}
      />
    );
  }

  const flow = resolveEvidenceResultFlow({
    verificationStatus: result.verificationStatus,
    attemptNumber: result.attemptNumber,
    expired: result.expired,
    reasonCode: result.reasonCode,
  });

  return (
    <EvidenceResultPanel
      colorScheme={colorScheme}
      flow={flow}
      messages={resultMessages}
      mediaAvailable={result.mediaAvailable}
      mediaDeletable={result.mediaDeletable}
      {...(result.mediaAvailable && activeAttemptId !== null
        ? {
            onSaveToPhotos: async () => {
              const actions = await authenticatedEvidenceMediaActions();
              return actions.saveToPhotos(activeAttemptId);
            },
          }
        : {})}
      {...(result.mediaAvailable && result.mediaDeletable && activeAttemptId !== null
        ? {
            onDeleteEvidence: async () => {
              const actions = await authenticatedEvidenceMediaActions();
              await actions.deleteEvidence(activeAttemptId);
              await refreshResult();
            },
          }
        : {})}
      onClose={close}
      onRetry={() => {
        submissionSession.reset();
        setOfflinePending(null);
        setResult(null);
        setActiveAttemptId(null);
      }}
      onSelfConfirm={async () => {
        if (activeAttemptId === null) return;
        const authState = await rootAuthController.restore();
        if (authState.status !== 'signed_in') throw new Error('evidence_requires_sign_in');
        const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
        const api = createAuthenticatedSyncApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        await api.completeMission(occurrenceId, {
          completionMode: 'self_confirmed',
          effectiveActionAt: new Date().toISOString(),
          evidenceAttemptId: activeAttemptId,
          deviceId,
          idempotencyKey: generateUuid(),
        });
        await rootSyncRuntime.run().catch(() => undefined);
        close();
      }}
    />
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localizationCatalogs } from '@misyra/localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import type { ColorScheme } from '../src/design-system/index.js';
import { createEvidenceApi, type EvidenceAttemptResult } from '../src/evidence/evidence-api.js';
import {
  EvidenceCaptureScreen,
  type EvidenceCaptureMessages,
} from '../src/evidence/evidence-capture-screen.js';
import { createExpoEvidenceCaptureRuntime } from '../src/evidence/expo-evidence-capture-runtime.js';
import { resolveEvidenceResultFlow } from '../src/evidence/evidence-result-flow.js';
import { createEvidenceSubmissionSession } from '../src/evidence/evidence-submission-session.js';
import {
  EvidenceResultPanel,
  type EvidenceResultMessages,
} from '../src/evidence/evidence-result-panel.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';
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
  const submissionSession = useMemo(
    () => createEvidenceSubmissionSession(generateUuid),
    [],
  );
  const [result, setResult] = useState<EvidenceAttemptResult | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [pollRetry, setPollRetry] = useState(0);

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
      accessToken: authState.session.accessToken,
    };
  }, []);

  const refreshResult = useCallback(async () => {
    if (activeAttemptId === null) return;
    const { api } = await authenticatedEvidenceApi();
    setResult(await api.getResult(activeAttemptId));
  }, [activeAttemptId, authenticatedEvidenceApi]);

  useEffect(() => {
    if (
      result === null ||
      (result.verificationStatus !== 'pending' && result.verificationStatus !== 'queued')
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void refreshResult().catch(() => {
        setPollRetry((value) => value + 1);
      });
    }, RESULT_POLL_MILLISECONDS);
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

  if (result === null) {
    return (
      <EvidenceCaptureScreen
        colorScheme={colorScheme}
        messages={captureMessages}
        runtime={runtime}
        onClose={close}
        onSubmit={async (file) => {
          const { api } = await authenticatedEvidenceApi();
          const submission = submissionSession.getOrCreate();
          setActiveAttemptId(submission.attemptId);
          const reservation = await api.reserveAttempt(occurrenceId, submission);
          await api.uploadOriginal(reservation.uploadPath, file.uri);
          setResult({
            attemptId: reservation.attemptId,
            occurrenceId: reservation.occurrenceId,
            attemptNumber: reservation.attemptNumber,
            firstSubmittedAt: reservation.firstSubmittedAt,
            effectiveSubmittedAt: reservation.effectiveSubmittedAt,
            verificationStatus: 'queued',
            reasonCode: null,
            expired: false,
          });
          void api
            .getResult(submission.attemptId)
            .then(setResult)
            .catch(() => {
              setPollRetry((value) => value + 1);
            });
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
      onClose={close}
      onRetry={() => {
        submissionSession.reset();
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

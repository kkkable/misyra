import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';
import { View, useColorScheme } from 'react-native';

import type { LocalizationLocale } from '@misyra/localization';

import { rootAuthController, rootAuthStorage } from '../auth/auth-runtime.js';
import type { ColorScheme } from '../design-system/contracts.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type LocalRepositories } from '../storage/local-repositories.js';
import { requireRegisteredDeviceId } from '../sync/root-sync-runtime.js';
import { CalendarDayScreen } from './calendar-day-screen.js';
import {
  resolveCalendarLanguage,
  resolveInitialCalendarLanguage,
} from './calendar-language-runtime.js';
import {
  createMissionAdjustmentUndoController,
  type AllowedMissionAdjustment,
  type MissionAdjustmentResult,
  type MissionAdjustmentSave,
} from './calendar-mission-adjustment.js';
import { MissionAdjustmentFeedback } from './calendar-mission-adjustment-feedback.js';
import { saveCalendarMissionAdjustment } from './calendar-mission-adjustment-save.js';
import {
  createCalendarMission,
  type CalendarMissionCreateInput,
} from './calendar-mission-create.js';

const LANGUAGE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;
const ADJUSTMENT_UNDO_VISIBLE_MS = 5_000;
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

export function CalendarRouteScreen() {
  const deviceLocale = useRef(getLocales()[0]).current;
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [language, setLanguage] = useState<LocalizationLocale>(() =>
    resolveInitialCalendarLanguage(deviceLocale),
  );
  const [adjustmentFeedback, setAdjustmentFeedback] = useState<AllowedMissionAdjustment | null>(
    null,
  );
  const adjustmentFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    let repositories: LocalRepositories | null = null;
    let repositoryAccountId: string | null = null;
    let refreshInFlight: Promise<void> | null = null;

    const readSettings = async (accountId: string) => {
      if (repositories === null || repositoryAccountId !== accountId) {
        const database = await openMobileDatabase();
        repositories = createLocalRepositories(database, accountId);
        repositoryAccountId = accountId;
      }
      return repositories.settings.get();
    };

    const refreshLanguage = () => {
      if (refreshInFlight !== null) return refreshInFlight;
      refreshInFlight = resolveCalendarLanguage({
        deviceLocale,
        readSession: () => rootAuthStorage.read(),
        readSettings,
      })
        .then((resolution) => {
          if (active) setLanguage(resolution.language);
        })
        .catch(() => undefined)
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    };

    void refreshLanguage();
    const initialSyncRecheck = setTimeout(() => {
      void refreshLanguage();
    }, INITIAL_SYNC_RECHECK_MS);
    const refreshInterval = setInterval(() => {
      void refreshLanguage();
    }, LANGUAGE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      clearTimeout(initialSyncRecheck);
      clearInterval(refreshInterval);
    };
  }, [deviceLocale]);

  useEffect(
    () => () => {
      if (adjustmentFeedbackTimer.current !== null) {
        clearTimeout(adjustmentFeedbackTimer.current);
      }
    },
    [],
  );

  const createMission = useCallback(async (input: CalendarMissionCreateInput) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_create_requires_sign_in');

    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();

    await createCalendarMission({
      database,
      accountId: authState.session.accountId,
      deviceId,
      input,
      now: new Date(),
      generateId: generateUuid,
    });
  }, []);

  const saveMissionAdjustment = useCallback(async (adjustment: MissionAdjustmentSave) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') {
      throw new Error('calendar_adjustment_requires_sign_in');
    }

    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();
    await saveCalendarMissionAdjustment({
      database,
      accountId: authState.session.accountId,
      deviceId,
      adjustment,
      now: new Date(),
      generateId: generateUuid,
    });
  }, []);

  const adjustmentController = useMemo(
    () => createMissionAdjustmentUndoController(saveMissionAdjustment),
    [saveMissionAdjustment],
  );
  const adjustMission = useCallback(
    async (adjustment: MissionAdjustmentResult) => {
      await adjustmentController.commit(adjustment);
      if (!adjustment.allowed) return;

      setAdjustmentFeedback(adjustment);
      if (adjustmentFeedbackTimer.current !== null) {
        clearTimeout(adjustmentFeedbackTimer.current);
      }
      adjustmentFeedbackTimer.current = setTimeout(() => {
        adjustmentFeedbackTimer.current = null;
        setAdjustmentFeedback(null);
      }, ADJUSTMENT_UNDO_VISIBLE_MS);
    },
    [adjustmentController],
  );
  const undoMissionAdjustment = useCallback(async () => {
    const undone = await adjustmentController.undo();
    if (!undone) return false;

    if (adjustmentFeedbackTimer.current !== null) {
      clearTimeout(adjustmentFeedbackTimer.current);
      adjustmentFeedbackTimer.current = null;
    }
    setAdjustmentFeedback(null);
    return true;
  }, [adjustmentController]);

  return (
    <View style={{ flex: 1 }}>
      <CalendarDayScreen
        language={language}
        onCreateMission={createMission}
        onMissionAdjustment={adjustMission}
      />
      {adjustmentFeedback === null ? null : (
        <MissionAdjustmentFeedback
          adjustment={adjustmentFeedback}
          colorScheme={colorScheme}
          language={language}
          onUndo={undoMissionAdjustment}
        />
      )}
    </View>
  );
}

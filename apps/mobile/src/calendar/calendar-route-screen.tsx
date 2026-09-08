import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, View, useColorScheme } from 'react-native';

import type { LocalizationLocale } from '@misyra/localization';

import { rootAuthController, rootAuthStorage } from '../auth/auth-runtime.js';
import type { ColorScheme } from '../design-system/contracts.js';
import {
  CalendarSearchScreen,
  type CalendarSearchResult,
} from '../search/calendar-search-screen.js';
import {
  resolveCalendarSearchNavigation,
  visibleCalendarSearchPersonalNoteExcerpt,
} from '../search/calendar-search-navigation.js';
import { createOfflineCalendarSearch } from '../search/offline-search.js';
import { openMobileDatabase } from '../storage/database.js';
import {
  createLocalRepositories,
  type LocalMission,
  type LocalRepositories,
} from '../storage/local-repositories.js';
import { requireRegisteredDeviceId } from '../sync/root-sync-runtime.js';
import type { AllDayMissionSummary } from './calendar-all-day.js';
import { CalendarDayScreen, type CalendarSearchFocusTarget } from './calendar-day-screen.js';
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
import type { MissionCardStatus, TimedMissionSummary } from './calendar-mission-layout.js';

const LANGUAGE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;
const ADJUSTMENT_UNDO_VISIBLE_MS = 5_000;
const CALENDAR_WINDOW_DAYS = 730;
const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

type AllDayMissionsByDate = Readonly<Record<string, readonly AllDayMissionSummary[]>>;
type TimedMissionsByDate = Readonly<Record<string, readonly TimedMissionSummary[]>>;

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

function formatLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calendarWindow(now: Date): Readonly<{ startLocalDate: string; endLocalDate: string }> {
  const center = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  return {
    startLocalDate: formatLocalDate(
      new Date(center.getTime() - CALENDAR_WINDOW_DAYS * dayMilliseconds),
    ),
    endLocalDate: formatLocalDate(
      new Date(center.getTime() + CALENDAR_WINDOW_DAYS * dayMilliseconds),
    ),
  };
}

function minuteFromLocalDateTime(value: string): number {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  if (match === null) throw new Error('Calendar mission local time is invalid.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function missionStatus(mission: LocalMission): MissionCardStatus {
  const occurrence = mission.occurrence;
  if (occurrence.completionState === 'incomplete') return 'unfinished';
  if (occurrence.evidenceState === 'not_required') return 'private';
  if (occurrence.evidenceState === 'accepted') return 'verified';
  return 'late';
}

function calendarMissionMaps(missions: readonly LocalMission[]): Readonly<{
  allDay: AllDayMissionsByDate;
  timed: TimedMissionsByDate;
}> {
  const allDay: Record<string, AllDayMissionSummary[]> = {};
  const timed: Record<string, TimedMissionSummary[]> = {};

  for (const mission of missions) {
    const occurrence = mission.occurrence;
    const schedule = occurrence.schedule;
    const localDate = schedule.localStart.slice(0, 10);
    const orderKey = schedule.startInstant;

    if (schedule.allDay) {
      const bucket = allDay[localDate] ?? [];
      bucket.push({
        id: occurrence.id,
        title: mission.series.title,
        orderKey,
        completed: occurrence.completionState === 'completed',
      });
      allDay[localDate] = bucket;
      continue;
    }

    const startMinute = minuteFromLocalDateTime(schedule.localStart);
    const finishDate = schedule.localFinish.slice(0, 10);
    const endMinute =
      finishDate === localDate ? minuteFromLocalDateTime(schedule.localFinish) : 24 * 60;
    if (endMinute <= startMinute) continue;

    const bucket = timed[localDate] ?? [];
    bucket.push({
      id: occurrence.id,
      title: mission.series.title,
      startMinute,
      endMinute,
      orderKey,
      status: missionStatus(mission),
      rewardEligibility: occurrence.rewardEligibility,
      timeZone: schedule.timeZone,
    });
    timed[localDate] = bucket;
  }

  return { allDay, timed };
}

function mergeMissionMaps<T extends { readonly id: string }>(
  current: Readonly<Record<string, readonly T[]>>,
  additional: Readonly<Record<string, readonly T[]>>,
): Readonly<Record<string, readonly T[]>> {
  const merged: Record<string, readonly T[]> = { ...current };
  for (const [date, additions] of Object.entries(additional)) {
    const existing = merged[date] ?? [];
    const existingIds = new Set(existing.map((mission) => mission.id));
    const uniqueAdditions = additions.filter((mission) => !existingIds.has(mission.id));
    merged[date] = uniqueAdditions.length === 0 ? existing : [...existing, ...uniqueAdditions];
  }
  return merged;
}

export function CalendarRouteScreen() {
  const router = useRouter();
  const deviceLocale = useRef(getLocales()[0]).current;
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [language, setLanguage] = useState<LocalizationLocale>(() =>
    resolveInitialCalendarLanguage(deviceLocale),
  );
  const [allDayMissionsByDate, setAllDayMissionsByDate] = useState<AllDayMissionsByDate>({});
  const [timedMissionsByDate, setTimedMissionsByDate] = useState<TimedMissionsByDate>({});
  const [adjustmentFeedback, setAdjustmentFeedback] = useState<AllowedMissionAdjustment | null>(
    null,
  );
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchFocusTarget, setSearchFocusTarget] = useState<CalendarSearchFocusTarget | undefined>(
    undefined,
  );
  const searchFocusRequestId = useRef(0);
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

  const refreshCalendarMissions = useCallback(async () => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') {
      setAllDayMissionsByDate({});
      setTimedMissionsByDate({});
      return;
    }

    const database = await openMobileDatabase();
    const repositories = createLocalRepositories(database, authState.session.accountId);
    const missions = await repositories.calendar.listWindow(calendarWindow(new Date()));
    const maps = calendarMissionMaps(missions);
    setAllDayMissionsByDate(maps.allDay);
    setTimedMissionsByDate(maps.timed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshCalendarMissions().catch(() => undefined);
      return undefined;
    }, [refreshCalendarMissions]),
  );

  const createMission = useCallback(
    async (input: CalendarMissionCreateInput) => {
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
      await refreshCalendarMissions();
    },
    [refreshCalendarMissions],
  );

  const saveMissionAdjustment = useCallback(
    async (adjustment: MissionAdjustmentSave) => {
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
      await refreshCalendarMissions();
    },
    [refreshCalendarMissions],
  );

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

  const openMissionDetails = useCallback(
    (mission: Readonly<{ id: string }>) => {
      router.push({ pathname: '/mission/[id]', params: { id: mission.id } });
    },
    [router],
  );

  const searchCalendar = useCallback(
    async (query: string): Promise<readonly CalendarSearchResult[]> => {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in') return [];

      const database = await openMobileDatabase();
      const repositories = createLocalRepositories(database, authState.session.accountId);
      const search = createOfflineCalendarSearch(database, authState.session.accountId);
      const results = await search.query(query);
      return Promise.all(
        results.map(async (result) => {
          if (result.occurrenceId === null) {
            return { ...result, personalNoteExcerpt: null, localDate: null };
          }
          const mission = await repositories.missions.getById(result.occurrenceId);
          return {
            ...result,
            personalNoteExcerpt: visibleCalendarSearchPersonalNoteExcerpt(result, mission),
            localDate: mission?.occurrence.schedule.localStart.slice(0, 10) ?? null,
          };
        }),
      );
    },
    [],
  );

  const openSearchResult = useCallback(
    async (result: CalendarSearchResult): Promise<boolean> => {
      const authState = await rootAuthController.restore();
      if (authState.status !== 'signed_in' || result.occurrenceId === null) return false;

      const database = await openMobileDatabase();
      const repositories = createLocalRepositories(database, authState.session.accountId);
      const mission = await repositories.missions.getById(result.occurrenceId);
      if (mission === null) return false;
      const resolution = await resolveCalendarSearchNavigation(result, () => Promise.resolve(mission));
      if (resolution.kind === 'unavailable') return false;

      const focusedMaps = calendarMissionMaps([mission]);
      setAllDayMissionsByDate((current) => mergeMissionMaps(current, focusedMaps.allDay));
      setTimedMissionsByDate((current) => mergeMissionMaps(current, focusedMaps.timed));
      searchFocusRequestId.current += 1;
      setSearchFocusTarget({ requestId: searchFocusRequestId.current, ...resolution.target });
      setTimeout(() => {
        router.push({
          pathname: '/mission/[id]',
          params: { id: resolution.target.missionId },
        });
      }, 0);
      return true;
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <CalendarDayScreen
        allDayMissionsByDate={allDayMissionsByDate}
        language={language}
        onAllDayMissionPress={openMissionDetails}
        onCreateMission={createMission}
        onMissionAdjustment={adjustMission}
        onSearchPress={() => {
          setSearchVisible(true);
        }}
        onTimedMissionPress={openMissionDetails}
        searchFocusTarget={searchFocusTarget}
        timedMissionsByDate={timedMissionsByDate}
      />
      {adjustmentFeedback === null ? null : (
        <MissionAdjustmentFeedback
          adjustment={adjustmentFeedback}
          colorScheme={colorScheme}
          language={language}
          onUndo={undoMissionAdjustment}
        />
      )}
      {searchVisible ? (
        <View style={styles.searchOverlay} testID="calendar-search-overlay">
          <CalendarSearchScreen
            colorScheme={colorScheme}
            language={language}
            onClose={() => {
              setSearchVisible(false);
            }}
            onOpenResult={openSearchResult}
            search={searchCalendar}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});

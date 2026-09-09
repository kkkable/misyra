import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCalendars } from 'expo-localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { layout, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs } from '@misyra/localization';

import { rootAuthController } from '../auth/auth-runtime.js';
import { themeColors, type ColorScheme } from '../design-system/index.js';
import { useAppLanguage } from '../localization/app-language-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type MissionDetails } from '../storage/local-repositories.js';
import { requireRegisteredDeviceId } from '../sync/root-sync-runtime.js';
import {
  deleteCalendarMission,
  undoCalendarMissionDeletion,
  type CalendarMissionDeletion,
} from './calendar-mission-delete.js';
import { prepareCalendarMissionDuplicate } from './calendar-mission-duplicate.js';
import {
  MissionDetailsScreen,
  type MissionDetailsEditableField,
  type MissionDetailsLifecycle,
  type MissionDetailsProjection,
} from './calendar-mission-details.js';
import { saveCalendarMissionDetails } from './calendar-mission-details-save.js';
import {
  createCalendarMission,
  type CalendarMissionCreateInput,
} from './calendar-mission-create.js';
import { CalendarMissionFormSheet } from './calendar-mission-form-sheet.js';
import { platformFirstWeekdayToDomain } from './calendar-region-runtime.js';

const COMPLETION_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const DELETE_UNDO_VISIBLE_MILLISECONDS = 5_000;
const MINUTES_PER_DAY = 24 * 60;
const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

type SearchDetailsRow = Readonly<{
  location: string | null;
  provider_text: string | null;
  personal_note: string | null;
  general_note: string | null;
}>;

type CompletionRow = Readonly<{ awarded_xp: number }>;
type PendingDeletion = Readonly<{ accountId: string; deletion: CalendarMissionDeletion }>;

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join('');
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

function routeMissionId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
}

function lifecycleForMission(mission: MissionDetails, now: Date): MissionDetailsLifecycle {
  const occurrence = mission.occurrence;
  if (occurrence.scheduleState === 'cancelled') return 'cancelled';
  if (occurrence.completionState === 'completed') return 'completed';
  const start = Date.parse(occurrence.schedule.startInstant);
  const finish = Date.parse(occurrence.schedule.finishInstant);
  const current = now.getTime();
  if (Number.isFinite(start) && current < start) return 'future';
  if (Number.isFinite(finish) && current >= finish + COMPLETION_WINDOW_MILLISECONDS) return 'expired';
  return 'active';
}

function providerDescription(mission: MissionDetails, fallback: string | null): string | null {
  for (const link of mission.externalLinks) {
    if (typeof link.payload !== 'object' || link.payload === null || Array.isArray(link.payload)) continue;
    const payload = link.payload as Record<string, unknown>;
    for (const key of ['description', 'organizerDescription', 'notes']) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  }
  return fallback;
}

function scheduleText(mission: MissionDetails): string {
  const schedule = mission.occurrence.schedule;
  if (schedule.allDay) return schedule.localStart.slice(0, 10);
  return `${schedule.localStart.replace('T', ' ')} – ${schedule.localFinish.replace('T', ' ')}`;
}

function clockFromLocalDateTime(value: string): string {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  return match === null ? '' : `${match[1]}:${match[2]}`;
}

function localDateFromLocalDateTime(value: string): string {
  return value.slice(0, 10);
}

function endClock(mission: MissionDetails): string {
  const schedule = mission.occurrence.schedule;
  if (schedule.allDay) return '';
  const base = clockFromLocalDateTime(schedule.localFinish);
  const finishDate = localDateFromLocalDateTime(schedule.localFinish);
  const startDate = localDateFromLocalDateTime(schedule.localStart);
  if (finishDate === startDate) return base;
  const parsed = parseClock(base);
  return parsed === null ? base : clockText(parsed + MINUTES_PER_DAY);
}

function clockText(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function projectDetails(
  mission: MissionDetails,
  search: SearchDetailsRow | null,
  completion: CompletionRow | null,
  now: Date,
): MissionDetailsProjection {
  const occurrence = mission.occurrence;
  const organizerControlled = occurrence.fieldOwnership === 'organizer_controlled';
  const lifecycle = lifecycleForMission(mission, now);
  return {
    id: occurrence.id,
    title: mission.series.title,
    scheduleText: scheduleText(mission),
    structuredSchedule: {
      date: localDateFromLocalDateTime(occurrence.schedule.localStart),
      start: occurrence.schedule.allDay ? '' : clockFromLocalDateTime(occurrence.schedule.localStart),
      end: endClock(mission),
      timeZone: occurrence.schedule.timeZone,
      allDay: occurrence.schedule.allDay,
    },
    recurring: mission.series.recurrence !== null,
    location: search?.location ?? null,
    providerDescription: organizerControlled
      ? providerDescription(mission, search?.provider_text ?? null)
      : null,
    notes: organizerControlled ? null : (search?.general_note ?? null),
    personalNote: mission.personalNote,
    fieldOwnership: occurrence.fieldOwnership,
    calendarSource: occurrence.calendarSource,
    lifecycle,
    completionState: occurrence.completionState,
    evidenceState: occurrence.evidenceState,
    rewardEligibility: occurrence.rewardEligibility,
    xpSummary: `${String(completion?.awarded_xp ?? 0)} XP`,
    zeroXpReason: null,
    cancellationAttribution:
      lifecycle === 'cancelled' && organizerControlled
        ? 'organizer'
        : lifecycle === 'cancelled'
          ? 'event'
          : null,
  };
}

export function CalendarMissionDetailsRouteScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const missionId = routeMissionId(params.id);
  const language = useAppLanguage();
  const catalog = localizationCatalogs[language];
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const systemCalendar = getCalendars().at(0);
  const uses24HourClock = systemCalendar?.uses24hourClock !== false;
  const weekStartsOn = platformFirstWeekdayToDomain(Number(systemCalendar?.firstWeekday));
  const [details, setDetails] = useState<MissionDetailsProjection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [duplicateDraft, setDuplicateDraft] = useState<CalendarMissionCreateInput | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const deletionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDetails = useCallback(async () => {
    if (missionId === null) { setDetails(null); setLoaded(true); return; }
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') { setDetails(null); setLoaded(true); return; }
    const database = await openMobileDatabase();
    const repositories = createLocalRepositories(database, authState.session.accountId);
    const mission = await repositories.missions.getById(missionId);
    if (mission === null) { setDetails(null); setLoaded(true); return; }
    const search = await database.getFirstAsync<SearchDetailsRow>(
      `SELECT location, provider_text, personal_note, general_note
         FROM search_documents
        WHERE account_id = ? AND occurrence_id = ?
        ORDER BY document_id
        LIMIT 1`,
      authState.session.accountId,
      missionId,
    );
    const completion = await database.getFirstAsync<CompletionRow>(
      `SELECT awarded_xp FROM completion_summaries WHERE account_id = ? AND occurrence_id = ?`,
      authState.session.accountId,
      missionId,
    );
    setDetails(projectDetails(mission, search, completion, new Date()));
    setLoaded(true);
  }, [missionId]);

  useEffect(() => {
    let active = true;
    void loadDetails().catch(() => { if (active) { setDetails(null); setLoaded(true); } });
    return () => { active = false; };
  }, [loadDetails]);

  useEffect(() => () => {
    if (deletionTimer.current !== null) clearTimeout(deletionTimer.current);
  }, []);

  const changeField = useCallback((field: MissionDetailsEditableField, value: string) => {
    setDetails((current) => {
      if (current === null) return current;
      if (field === 'title') return { ...current, title: value };
      if (field === 'location') return { ...current, location: value };
      if (field === 'notes') return { ...current, notes: value };
      if (field === 'personalNote') return { ...current, personalNote: value };
      const schedule = current.structuredSchedule;
      if (schedule === undefined) return current;
      if (field === 'date') return { ...current, structuredSchedule: { ...schedule, date: value } };
      if (field === 'start') return { ...current, structuredSchedule: { ...schedule, start: value } };
      if (field === 'end') return { ...current, structuredSchedule: { ...schedule, end: value } };
      if (field === 'timeZone') return { ...current, structuredSchedule: { ...schedule, timeZone: value } };
      return current;
    });
  }, []);

  const saveDetails = useCallback(async () => {
    if (details === null || details.structuredSchedule === undefined || details.recurring === true) return;
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_edit_requires_sign_in');
    const startMinute = details.structuredSchedule.allDay ? null : parseClock(details.structuredSchedule.start);
    const endMinute = details.structuredSchedule.allDay ? null : parseClock(details.structuredSchedule.end);
    if (!details.structuredSchedule.allDay && (startMinute === null || endMinute === null)) {
      throw new RangeError('calendar_edit_invalid_time');
    }
    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();
    await saveCalendarMissionDetails({
      database,
      accountId: authState.session.accountId,
      deviceId,
      edit: {
        missionId: details.id,
        title: details.title,
        selectedDate: details.structuredSchedule.date,
        startMinute,
        endMinute,
        timeZone: details.structuredSchedule.timeZone,
        location: details.location,
        notes: details.notes,
      },
      now: new Date(),
      generateId: generateUuid,
    });
    setLoaded(false);
    await loadDetails();
  }, [details, loadDetails]);

  const deleteMission = useCallback(async (targetMissionId: string) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_delete_requires_sign_in');
    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();
    const deletion = await deleteCalendarMission({ database, accountId: authState.session.accountId, deviceId, occurrenceId: targetMissionId, now: new Date(), generateId: generateUuid });
    setPendingDeletion({ accountId: authState.session.accountId, deletion });
    setDetails(null);
    if (deletionTimer.current !== null) clearTimeout(deletionTimer.current);
    deletionTimer.current = setTimeout(() => { deletionTimer.current = null; setPendingDeletion(null); router.back(); }, DELETE_UNDO_VISIBLE_MILLISECONDS);
  }, [router]);

  const undoDeletion = useCallback(async () => {
    if (pendingDeletion === null) return;
    if (deletionTimer.current !== null) { clearTimeout(deletionTimer.current); deletionTimer.current = null; }
    const database = await openMobileDatabase();
    const restored = await undoCalendarMissionDeletion({ database, accountId: pendingDeletion.accountId, deletion: pendingDeletion.deletion });
    setPendingDeletion(null);
    if (!restored) { router.back(); return; }
    setLoaded(false);
    await loadDetails();
  }, [loadDetails, pendingDeletion, router]);

  const duplicateMission = useCallback(async (targetMissionId: string) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_duplicate_requires_sign_in');
    const database = await openMobileDatabase();
    const draft = await prepareCalendarMissionDuplicate({ database, accountId: authState.session.accountId, occurrenceId: targetMissionId, now: new Date() });
    setDuplicateDraft(draft);
  }, []);

  const saveDuplicate = useCallback(async (input: CalendarMissionCreateInput) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_duplicate_requires_sign_in');
    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();
    await createCalendarMission({ database, accountId: authState.session.accountId, deviceId, input, now: new Date(), generateId: generateUuid });
    setDuplicateDraft(null);
    router.back();
  }, [router]);

  const close = useCallback(() => { router.back(); }, [router]);

  const header = useMemo(() => (
    <View style={[styles.header, { backgroundColor: colors.canvas }]}>
      <Pressable accessibilityLabel={catalog['calendar.shell.close']} accessibilityRole="button" onPress={close} style={styles.closeButton} testID="mission-details-close">
        <Text allowFontScaling style={[styles.closeText, { color: colors.primary }]}>{catalog['calendar.shell.close']}</Text>
      </Pressable>
    </View>
  ), [catalog, close, colors.canvas, colors.primary]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (pendingDeletion !== null) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.canvas }]}>
        {header}
        <Pressable accessibilityLabel={catalog['calendar.adjustment.undo']} accessibilityRole="button" onPress={() => { void undoDeletion().catch(() => { router.back(); }); }} style={styles.undoButton} testID="mission-delete-undo">
          <Text allowFontScaling style={[styles.closeText, { color: colors.primary }]}>{catalog['calendar.adjustment.undo']}</Text>
        </Pressable>
      </View>
    );
  }
  if (details === null) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.canvas }]}>
        {header}
        <Text allowFontScaling style={[styles.missingText, { color: colors.textSecondary }]}>{catalog['sync.conflict.missionDeleted']}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      {header}
      <MissionDetailsScreen
        colorScheme={colorScheme}
        details={details}
        language={language}
        onDelete={deleteMission}
        onDuplicate={duplicateMission}
        onFieldChange={changeField}
        onSave={saveDetails}
      />
      {duplicateDraft === null ? null : (
        <CalendarMissionFormSheet
          colorScheme={colorScheme}
          creationSlotMinute={duplicateDraft.startMinute ?? 8 * 60}
          initialInput={duplicateDraft}
          language={language}
          now={new Date()}
          onCancel={() => { setDuplicateDraft(null); }}
          onSubmit={saveDuplicate}
          selectedDate={duplicateDraft.selectedDate}
          timeZone={duplicateDraft.timeZone}
          uses24HourClock={uses24HourClock}
          weekStartsOn={weekStartsOn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: layout.minimumTouchTarget, paddingHorizontal: layout.screenHorizontalPadding, paddingTop: space[2] },
  closeButton: { alignItems: 'flex-start', justifyContent: 'center', minHeight: layout.minimumTouchTarget },
  closeText: { fontSize: typography.body.fontSize, fontWeight: typography.body.mediumFontWeight },
  missing: { flex: 1 },
  missingText: { fontSize: typography.body.fontSize, paddingHorizontal: layout.screenHorizontalPadding, paddingTop: space[4] },
  undoButton: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, paddingHorizontal: layout.screenHorizontalPadding },
});

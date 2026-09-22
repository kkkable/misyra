import { useEffect, useMemo, useState } from 'react';
import { getCalendars } from 'expo-localization';

import type { ColorScheme } from '../design-system/index.js';
import { createLocalRepositories } from '../storage/local-repositories.js';
import type { MutationQueueDatabase } from '../storage/mutation-queue.js';
import type { AllDayMissionSummary } from '../calendar/calendar-all-day.js';
import { CalendarDayScreen } from '../calendar/calendar-day-screen.js';
import { CalendarMissionFormSheet } from '../calendar/calendar-mission-form-sheet.js';
import type { MissionAdjustmentResult } from '../calendar/calendar-mission-adjustment.js';
import type { TimedMissionSummary } from '../calendar/calendar-mission-layout.js';
import {
  calendarMissionMaps,
  calendarWindow,
  projectLocalMissionForAppTimeZone,
  type AllDayMissionsByDate,
  type TimedMissionsByDate,
} from '../calendar/calendar-mission-projection.js';
import {
  createPlannerCalendarDraftStore,
  plannerDraftCalendarMaps,
  plannerDraftItemInput,
  type PlannerCalendarDraftDocument,
  type PlannerCalendarDraftItem,
} from './calendar-draft-preview.js';

type PlannerDraftStore = ReturnType<typeof createPlannerCalendarDraftStore>;

type PlannerCalendarPreviewProps = Readonly<{
  accountId: string;
  appTimeZone: string;
  colorScheme: ColorScheme;
  database: MutationQueueDatabase;
  document: PlannerCalendarDraftDocument;
  language: 'en' | 'zh-HK';
  onDocumentChange: (document: PlannerCalendarDraftDocument) => void;
  store: PlannerDraftStore;
}>;

function mergeMissionMaps<T extends { readonly id: string }>(
  active: Readonly<Record<string, readonly T[]>>,
  draft: Readonly<Record<string, readonly T[]>>,
): Readonly<Record<string, readonly T[]>> {
  const merged: Record<string, readonly T[]> = { ...active };
  for (const [date, missions] of Object.entries(draft)) {
    merged[date] = [...(merged[date] ?? []), ...missions];
  }
  return merged;
}

function isDraftMission(mission: TimedMissionSummary | AllDayMissionSummary): boolean {
  return mission.previewKind === 'planner_draft';
}

function itemStartMinute(item: PlannerCalendarDraftItem): number {
  const input = plannerDraftItemInput(item);
  return input.startMinute ?? 0;
}

export function AiPlannerCalendarPreview({
  accountId,
  appTimeZone,
  colorScheme,
  database,
  document,
  language,
  onDocumentChange,
  store,
}: PlannerCalendarPreviewProps) {
  const [activeAllDay, setActiveAllDay] = useState<AllDayMissionsByDate>({});
  const [activeTimed, setActiveTimed] = useState<TimedMissionsByDate>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const draftMaps = useMemo(() => plannerDraftCalendarMaps(document), [document]);
  const allDayMissionsByDate = useMemo(
    () => mergeMissionMaps(activeAllDay, draftMaps.allDay),
    [activeAllDay, draftMaps.allDay],
  );
  const timedMissionsByDate = useMemo(
    () => mergeMissionMaps(activeTimed, draftMaps.timed),
    [activeTimed, draftMaps.timed],
  );
  const editingItem = document.items.find((item) => item.id === editingItemId) ?? null;
  const firstDraftDate = document.items[0]?.localDate;
  const uses24HourClock = getCalendars()[0]?.uses24hourClock !== false;

  useEffect(() => {
    let active = true;
    const repositories = createLocalRepositories(database, accountId);
    void repositories.calendar
      .listWindow(calendarWindow(new Date()))
      .then((missions) => {
        if (!active) return;
        const projected = missions.map((mission) =>
          projectLocalMissionForAppTimeZone(mission, appTimeZone),
        );
        const maps = calendarMissionMaps(projected);
        setActiveAllDay(maps.allDay);
        setActiveTimed(maps.timed);
      })
      .catch(() => {
        if (!active) return;
        setActiveAllDay({});
        setActiveTimed({});
      });

    return () => {
      active = false;
    };
  }, [accountId, appTimeZone, database]);

  const updateDocument = async (
    action: () => Promise<PlannerCalendarDraftDocument>,
  ): Promise<void> => {
    onDocumentChange(await action());
  };

  const adjustDraftMission = async (adjustment: MissionAdjustmentResult): Promise<void> => {
    if (!adjustment.allowed) return;
    const item = document.items.find((candidate) => candidate.id === adjustment.missionId);
    if (item === undefined) return;
    await updateDocument(() =>
      store.adjust({
        missionId: adjustment.missionId,
        startMinute: adjustment.startMinute,
        endMinute: adjustment.endMinute,
        rewardEligibility: 'ineligible',
        source: adjustment.kind,
      }),
    );
  };

  const openDraftItem = (mission: TimedMissionSummary | AllDayMissionSummary) => {
    if (isDraftMission(mission)) setEditingItemId(mission.id);
  };

  return (
    <>
      <CalendarDayScreen
        allDayMissionsByDate={allDayMissionsByDate}
        appTimeZone={appTimeZone}
        creationMode="planner_draft"
        initialDate={firstDraftDate}
        isMissionAdjustable={isDraftMission}
        language={language}
        onAllDayMissionPress={openDraftItem}
        onCreateMission={(input) => updateDocument(() => store.add(input))}
        onMissionAdjustment={adjustDraftMission}
        onTimedMissionPress={openDraftItem}
        timedMissionsByDate={timedMissionsByDate}
      />
      {editingItem === null ? null : (
        <CalendarMissionFormSheet
          colorScheme={colorScheme}
          creationSlotMinute={itemStartMinute(editingItem)}
          initialInput={plannerDraftItemInput(editingItem)}
          language={language}
          mode="planner_draft"
          now={new Date()}
          onCancel={() => {
            setEditingItemId(null);
          }}
          onDelete={() =>
            updateDocument(() => store.remove(editingItem.id)).then(() => {
              setEditingItemId(null);
            })
          }
          onSubmit={(input) =>
            updateDocument(() => store.update(editingItem.id, input)).then(() => {
              setEditingItemId(null);
            })
          }
          selectedDate={editingItem.localDate}
          timeZone={editingItem.timeZone}
          uses24HourClock={uses24HourClock}
        />
      )}
    </>
  );
}

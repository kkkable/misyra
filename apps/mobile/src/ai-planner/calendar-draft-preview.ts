import type { CalendarMissionCreateInput } from '../calendar/calendar-mission-create.js';
import type { MissionAdjustmentSave } from '../calendar/calendar-mission-adjustment.js';
import type { AllDayMissionSummary } from '../calendar/calendar-all-day.js';
import type { TimedMissionSummary } from '../calendar/calendar-mission-layout.js';
import type { MutationQueueDatabase } from '../storage/mutation-queue.js';

export type PlannerCalendarDraftItem = Readonly<{
  id: string;
  title: string;
  localDate: string;
  startLocalTime?: string;
  endLocalTime?: string;
  allDay: boolean;
  estimatedMinutes: number;
  timeZone: string;
  location?: string;
  notes?: string;
}>;

export type PlannerCalendarDraftDocument = Readonly<{
  text: string;
  imageAssetIds: readonly string[];
  items: readonly PlannerCalendarDraftItem[];
}>;

export type PlannerDraftCalendarMaps = Readonly<{
  allDay: Readonly<Record<string, readonly AllDayMissionSummary[]>>;
  timed: Readonly<Record<string, readonly TimedMissionSummary[]>>;
}>;

export function parsePlannerCalendarDraftDocument(source: unknown): PlannerCalendarDraftDocument {
  void source;
  throw new Error('MTS-088 Planner Calendar draft document is not implemented.');
}

export function plannerDraftCalendarMaps(
  document: PlannerCalendarDraftDocument,
): PlannerDraftCalendarMaps {
  void document;
  throw new Error('MTS-088 Planner Calendar preview projection is not implemented.');
}

export function createPlannerCalendarDraftStore(options: Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  generateMutationId: () => string;
  generateItemId: () => string;
  now: () => Date;
}>) {
  void options;
  return Object.freeze({
    async load(): Promise<PlannerCalendarDraftDocument | null> {
      await Promise.resolve();
      throw new Error('MTS-088 Planner Calendar draft loading is not implemented.');
    },
    async add(input: CalendarMissionCreateInput): Promise<PlannerCalendarDraftDocument> {
      await Promise.resolve();
      void input;
      throw new Error('MTS-088 Planner Calendar draft add is not implemented.');
    },
    async update(
      itemId: string,
      input: CalendarMissionCreateInput,
    ): Promise<PlannerCalendarDraftDocument> {
      await Promise.resolve();
      void itemId;
      void input;
      throw new Error('MTS-088 Planner Calendar draft edit is not implemented.');
    },
    async adjust(adjustment: MissionAdjustmentSave): Promise<PlannerCalendarDraftDocument> {
      await Promise.resolve();
      void adjustment;
      throw new Error('MTS-088 Planner Calendar draft adjustment is not implemented.');
    },
    async remove(itemId: string): Promise<PlannerCalendarDraftDocument> {
      await Promise.resolve();
      void itemId;
      throw new Error('MTS-088 Planner Calendar draft deletion is not implemented.');
    },
  });
}

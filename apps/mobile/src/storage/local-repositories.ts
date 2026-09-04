import {
  createMissionOccurrence,
  createMissionSeries,
  type MissionOccurrence,
  type MissionOccurrenceInput,
  type MissionSeries,
  type MissionSeriesInput,
} from '@misyra/domain';

import type { MigrationDatabase, SqlBindValue } from './schema.js';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BOUNDED_RESULTS = 100;

export interface LocalRepositoryDatabase extends MigrationDatabase {
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

export interface CalendarWindow {
  readonly startLocalDate: string;
  readonly endLocalDate: string;
}

export interface LocalMission {
  readonly series: MissionSeries;
  readonly occurrence: MissionOccurrence;
}

export interface MissionDetails extends LocalMission {
  readonly personalNote: string | null;
  readonly externalLinks: readonly ExternalLinkSummary[];
}

export interface ExternalLinkSummary {
  readonly provider: string;
  readonly externalEventId: string;
  readonly payload: unknown;
  readonly updatedAt: string;
}

export interface CompletionSummary {
  readonly occurrenceId: string;
  readonly completedAt: string;
  readonly awardedXp: number;
  readonly payload: unknown;
  readonly updatedAt: string;
}

export interface LocalSettings {
  readonly language: 'en' | 'zh-HK';
  readonly trustMode: boolean;
  readonly appTimeZone: string;
  readonly updatedAt: string | null;
}

export interface HiddenEventSummary {
  readonly hiddenEventId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly payload: unknown;
  readonly updatedAt: string;
}

export interface PlannerDraft {
  readonly draftId: string;
  readonly content: unknown;
  readonly updatedAt: string;
}

export interface StoryDraft {
  readonly occurrenceId: string;
  readonly draftId: string;
  readonly composition: unknown;
  readonly updatedAt: string;
}

export interface SearchDocument {
  readonly documentId: string;
  readonly occurrenceId: string | null;
  readonly title: string;
  readonly location: string | null;
  readonly providerText: string | null;
  readonly personalNote: string | null;
  readonly updatedAt: string;
}

export interface ObservableLocalQuery<T> {
  getSnapshot(): T | undefined;
  refresh(): Promise<T>;
  subscribe(listener: () => void): () => void;
}

type QueryDependency =
  | 'cached_mission_series'
  | 'cached_mission_occurrences'
  | 'completion_summaries'
  | 'personal_notes'
  | 'external_links'
  | 'hidden_event_summaries'
  | 'local_accounts'
  | 'planner_drafts'
  | 'story_drafts'
  | 'search_documents';

type RegisteredQuery = Readonly<{
  dependencies: ReadonlySet<QueryDependency>;
  refresh: () => Promise<unknown>;
}>;

interface MissionRow {
  readonly series_payload_json: string;
  readonly occurrence_payload_json: string;
}

interface MissionDetailsRow extends MissionRow {
  readonly personal_note: string | null;
}

interface ExternalLinkRow {
  readonly provider: string;
  readonly external_event_id: string;
  readonly payload_json: string;
  readonly updated_at: string;
}

interface CompletionRow {
  readonly occurrence_id: string;
  readonly completed_at: string;
  readonly awarded_xp: number;
  readonly payload_json: string;
  readonly updated_at: string;
  readonly occurrence_payload_json: string;
}

interface SettingsRow {
  readonly language: string;
  readonly trust_mode: number;
  readonly app_time_zone: string;
  readonly settings_updated_at: string | null;
}

interface HiddenEventRow {
  readonly hidden_event_id: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly payload_json: string;
  readonly updated_at: string;
}

interface PlannerDraftRow {
  readonly draft_id: string;
  readonly content_json: string;
  readonly updated_at: string;
}

interface StoryDraftRow {
  readonly occurrence_id: string;
  readonly draft_id: string;
  readonly composition_json: string;
  readonly updated_at: string;
}

interface SearchDocumentRow {
  readonly document_id: string;
  readonly occurrence_id: string | null;
  readonly title: string;
  readonly location: string | null;
  readonly provider_text: string | null;
  readonly personal_note: string | null;
  readonly updated_at: string;
  readonly occurrence_payload_json: string | null;
}

function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}

function mapMission(row: MissionRow): LocalMission {
  return {
    series: createMissionSeries(parseJson(row.series_payload_json) as MissionSeriesInput),
    occurrence: createMissionOccurrence(
      parseJson(row.occurrence_payload_json) as MissionOccurrenceInput,
    ),
  };
}

function isVisibleMission(mission: LocalMission): boolean {
  return mission.occurrence.deletionState !== 'deleted';
}

function assertWindow(window: CalendarWindow): void {
  if (
    !LOCAL_DATE_PATTERN.test(window.startLocalDate) ||
    !LOCAL_DATE_PATTERN.test(window.endLocalDate)
  ) {
    throw new TypeError('Calendar query dates must use YYYY-MM-DD format.');
  }
  if (window.startLocalDate > window.endLocalDate) {
    throw new RangeError('Calendar query start must not be after its end.');
  }
}

function boundedLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_BOUNDED_RESULTS) {
    throw new RangeError(
      `Local query limit must be an integer from 1 to ${String(MAX_BOUNDED_RESULTS)}.`,
    );
  }
  return limit;
}

function createObservableQuery<T>(
  loader: () => Promise<T>,
  dependencies: readonly QueryDependency[],
  register: (query: RegisteredQuery) => () => void,
): ObservableLocalQuery<T> {
  let snapshot: T | undefined;
  const listeners = new Set<() => void>();
  let unregister: (() => void) | undefined;

  const query: ObservableLocalQuery<T> = {
    getSnapshot: () => snapshot,
    refresh: async () => {
      snapshot = await loader();
      for (const listener of listeners) listener();
      return snapshot;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        unregister = register({
          dependencies: new Set(dependencies),
          refresh: () => query.refresh(),
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unregister?.();
          unregister = undefined;
        }
      };
    },
  };

  return query;
}

export function createLocalRepositories(database: LocalRepositoryDatabase, accountId: string) {
  const registeredQueries = new Set<RegisteredQuery>();

  const register = (query: RegisteredQuery) => {
    registeredQueries.add(query);
    return () => registeredQueries.delete(query);
  };

  const observe = <T>(loader: () => Promise<T>, dependencies: readonly QueryDependency[]) =>
    createObservableQuery(loader, dependencies, register);

  const listCalendarWindow = async (window: CalendarWindow): Promise<LocalMission[]> => {
    assertWindow(window);
    const rows = await database.getAllAsync<MissionRow>(
      `SELECT s.payload_json AS series_payload_json,
              o.payload_json AS occurrence_payload_json
         FROM cached_mission_occurrences o
         JOIN cached_mission_series s
           ON s.account_id = o.account_id
          AND s.series_id = o.series_id
        WHERE o.account_id = ?
          AND o.local_date >= ?
          AND o.local_date <= ?
        ORDER BY o.local_date,
                 CASE WHEN o.scheduled_start IS NULL THEN 0 ELSE 1 END,
                 o.scheduled_start,
                 o.occurrence_id`,
      accountId,
      window.startLocalDate,
      window.endLocalDate,
    );
    return rows.map(mapMission).filter(isVisibleMission);
  };

  const getMissionById = async (occurrenceId: string): Promise<MissionDetails | null> => {
    const row = await database.getFirstAsync<MissionDetailsRow>(
      `SELECT s.payload_json AS series_payload_json,
              o.payload_json AS occurrence_payload_json,
              n.note AS personal_note
         FROM cached_mission_occurrences o
         JOIN cached_mission_series s
           ON s.account_id = o.account_id
          AND s.series_id = o.series_id
         LEFT JOIN personal_notes n
           ON n.account_id = o.account_id
          AND n.occurrence_id = o.occurrence_id
        WHERE o.account_id = ? AND o.occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    if (row === null) return null;
    const mission = mapMission(row);
    if (!isVisibleMission(mission)) return null;

    const links = await database.getAllAsync<ExternalLinkRow>(
      `SELECT provider, external_event_id, payload_json, updated_at
         FROM external_links
        WHERE account_id = ? AND occurrence_id = ?
        ORDER BY provider, external_event_id`,
      accountId,
      occurrenceId,
    );
    return {
      ...mission,
      personalNote: row.personal_note,
      externalLinks: links.map((link) => ({
        provider: link.provider,
        externalEventId: link.external_event_id,
        payload: parseJson(link.payload_json),
        updatedAt: link.updated_at,
      })),
    };
  };

  const listRecentProgress = async (limit: number): Promise<CompletionSummary[]> => {
    const requestedLimit = boundedLimit(limit);
    const rows = await database.getAllAsync<CompletionRow>(
      `SELECT c.occurrence_id,
              c.completed_at,
              c.awarded_xp,
              c.payload_json,
              c.updated_at,
              o.payload_json AS occurrence_payload_json
         FROM completion_summaries c
         JOIN cached_mission_occurrences o
           ON o.account_id = c.account_id
          AND o.occurrence_id = c.occurrence_id
        WHERE c.account_id = ?
          AND json_extract(o.payload_json, '$.deletionState') <> 'deleted'
        ORDER BY c.completed_at DESC, c.occurrence_id
        LIMIT ?`,
      accountId,
      requestedLimit,
    );
    return rows.map((row) => ({
      occurrenceId: row.occurrence_id,
      completedAt: row.completed_at,
      awardedXp: row.awarded_xp,
      payload: parseJson(row.payload_json),
      updatedAt: row.updated_at,
    }));
  };

  const getSettings = async (): Promise<LocalSettings | null> => {
    const row = await database.getFirstAsync<SettingsRow>(
      `SELECT language, trust_mode, app_time_zone, settings_updated_at
         FROM local_accounts
        WHERE account_id = ?`,
      accountId,
    );
    if (row === null) return null;
    if (row.language !== 'en' && row.language !== 'zh-HK') {
      throw new TypeError(`Unsupported local settings language: ${row.language}.`);
    }
    return {
      language: row.language,
      trustMode: row.trust_mode === 1,
      appTimeZone: row.app_time_zone,
      updatedAt: row.settings_updated_at,
    };
  };

  const listHiddenEvents = async (limit: number): Promise<HiddenEventSummary[]> => {
    const requestedLimit = boundedLimit(limit);
    const now = new Date().toISOString();
    const rows = await database.getAllAsync<HiddenEventRow>(
      `SELECT hidden_event_id, starts_at, ends_at, payload_json, updated_at
         FROM hidden_event_summaries
        WHERE account_id = ?
          AND ends_at > ?
        ORDER BY starts_at, hidden_event_id
        LIMIT ?`,
      accountId,
      now,
      requestedLimit,
    );
    return rows.map((row) => ({
      hiddenEventId: row.hidden_event_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      payload: parseJson(row.payload_json),
      updatedAt: row.updated_at,
    }));
  };

  const getPlannerDraft = async (): Promise<PlannerDraft | null> => {
    const row = await database.getFirstAsync<PlannerDraftRow>(
      `SELECT draft_id, content_json, updated_at
         FROM planner_drafts
        WHERE account_id = ?`,
      accountId,
    );
    return row === null
      ? null
      : {
          draftId: row.draft_id,
          content: parseJson(row.content_json),
          updatedAt: row.updated_at,
        };
  };

  const getStoryDraft = async (occurrenceId: string): Promise<StoryDraft | null> => {
    const row = await database.getFirstAsync<StoryDraftRow>(
      `SELECT d.occurrence_id, d.draft_id, d.composition_json, d.updated_at
       FROM story_drafts d
       JOIN cached_mission_occurrences o
         ON o.account_id = d.account_id
        AND o.occurrence_id = d.occurrence_id
      WHERE d.account_id = ?
        AND d.occurrence_id = ?
        AND json_extract(o.payload_json, '$.deletionState') <> 'deleted'`,
      accountId,
      occurrenceId,
    );
    return row === null
      ? null
      : {
          occurrenceId: row.occurrence_id,
          draftId: row.draft_id,
          composition: parseJson(row.composition_json),
          updatedAt: row.updated_at,
        };
  };

  const listSearchDocuments = async (limit: number): Promise<SearchDocument[]> => {
    const requestedLimit = boundedLimit(limit);
    const rows = await database.getAllAsync<SearchDocumentRow>(
      `SELECT d.document_id,
              d.occurrence_id,
              d.title,
              d.location,
              d.provider_text,
              d.personal_note,
              d.updated_at,
              o.payload_json AS occurrence_payload_json
         FROM search_documents d
         LEFT JOIN cached_mission_occurrences o
           ON o.account_id = d.account_id
          AND o.occurrence_id = d.occurrence_id
        WHERE d.account_id = ?
          AND (
            d.occurrence_id IS NULL
            OR (
              o.payload_json IS NOT NULL
              AND json_extract(o.payload_json, '$.deletionState') <> 'deleted'
            )
          )
        ORDER BY d.updated_at DESC, d.document_id
        LIMIT ?`,
      accountId,
      requestedLimit,
    );
    return rows.map((row) => ({
      documentId: row.document_id,
      occurrenceId: row.occurrence_id,
      title: row.title,
      location: row.location,
      providerText: row.provider_text,
      personalNote: row.personal_note,
      updatedAt: row.updated_at,
    }));
  };

  const repositories = {
    calendar: {
      listWindow: listCalendarWindow,
      observeWindow: (window: CalendarWindow) => {
        assertWindow(window);
        return observe(
          () => listCalendarWindow(window),
          ['cached_mission_series', 'cached_mission_occurrences'],
        );
      },
    },
    missions: {
      getById: getMissionById,
      observeById: (occurrenceId: string) =>
        observe(
          () => getMissionById(occurrenceId),
          [
            'cached_mission_series',
            'cached_mission_occurrences',
            'personal_notes',
            'external_links',
          ],
        ),
    },
    progress: {
      listRecent: listRecentProgress,
      observeRecent: (limit: number) => {
        boundedLimit(limit);
        return observe(
          () => listRecentProgress(limit),
          ['completion_summaries', 'cached_mission_occurrences'],
        );
      },
    },
    settings: {
      get: getSettings,
      observe: () => observe(getSettings, ['local_accounts']),
      listHiddenEvents,
      observeHiddenEvents: (limit: number) => {
        boundedLimit(limit);
        return observe(() => listHiddenEvents(limit), ['hidden_event_summaries']);
      },
    },
    drafts: {
      getPlanner: getPlannerDraft,
      observePlanner: () => observe(getPlannerDraft, ['planner_drafts']),
      getStory: getStoryDraft,
      observeStory: (occurrenceId: string) =>
        observe(() => getStoryDraft(occurrenceId), ['story_drafts', 'cached_mission_occurrences']),
    },
    search: {
      listDocuments: listSearchDocuments,
      observeDocuments: (limit: number) => {
        boundedLimit(limit);
        return observe(
          () => listSearchDocuments(limit),
          ['search_documents', 'cached_mission_occurrences'],
        );
      },
    },
    invalidate: async (dependencies: readonly QueryDependency[]): Promise<void> => {
      const changed = new Set(dependencies);
      const affected = [...registeredQueries].filter((query) =>
        [...query.dependencies].some((dependency) => changed.has(dependency)),
      );
      await Promise.all(affected.map((query) => query.refresh()));
    },
  };

  return repositories;
}

export type LocalRepositories = ReturnType<typeof createLocalRepositories>;

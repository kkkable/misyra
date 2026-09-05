import type { MigrationDatabase, SqlBindValue } from '../storage/schema.js';

const MAX_SEARCH_RESULTS = 50;
const PERSONAL_NOTE_EXCERPT_LIMIT = 96;

export interface OfflineSearchDatabase extends MigrationDatabase {
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

export interface OfflineSearchResult {
  readonly documentId: string;
  readonly occurrenceId: string | null;
  readonly title: string;
  readonly location: string | null;
  readonly providerText: string | null;
  readonly personalNoteExcerpt: string | null;
}

interface SearchRow {
  readonly document_id: string;
  readonly occurrence_id: string | null;
  readonly title: string;
  readonly location: string | null;
  readonly provider_text: string | null;
  readonly personal_note: string | null;
}

function searchTokens(query: string): string[] {
  return (
    query
      .normalize('NFKC')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_]+/gu) ?? []
  );
}

function toFtsQuery(tokens: readonly string[]): string {
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
}

function fieldMatchesToken(value: string | null, token: string): boolean {
  if (value === null) return false;
  return searchTokens(value).some((word) => word.startsWith(token));
}

function personalNoteCausedMatch(row: SearchRow, tokens: readonly string[]): boolean {
  return tokens.some((token) => {
    const visibleMatched =
      fieldMatchesToken(row.title, token) ||
      fieldMatchesToken(row.location, token) ||
      fieldMatchesToken(row.provider_text, token);
    return !visibleMatched && fieldMatchesToken(row.personal_note, token);
  });
}

function personalNoteExcerpt(note: string, tokens: readonly string[]): string {
  const normalized = note.normalize('NFKC').toLocaleLowerCase();
  const firstIndex =
    tokens
      .map((token) => normalized.indexOf(token))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0] ?? 0;
  const radius = Math.floor(PERSONAL_NOTE_EXCERPT_LIMIT / 2);
  const start = Math.max(0, firstIndex - radius);
  const end = Math.min(note.length, start + PERSONAL_NOTE_EXCERPT_LIMIT);
  return note.slice(start, end);
}

async function ensureSearchIndex(database: OfflineSearchDatabase): Promise<void> {
  const existing = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'search_documents_fts'",
  );
  if (existing !== null) return;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
      account_id UNINDEXED,
      document_id UNINDEXED,
      title,
      location,
      provider_text,
      personal_note,
      content='search_documents',
      content_rowid='rowid'
    )`);
    await transaction.execAsync(`CREATE TRIGGER IF NOT EXISTS search_documents_fts_insert
      AFTER INSERT ON search_documents BEGIN
        INSERT INTO search_documents_fts(
          rowid, account_id, document_id, title, location, provider_text, personal_note
        ) VALUES (
          new.rowid, new.account_id, new.document_id, new.title, new.location,
          new.provider_text, new.personal_note
        );
      END`);
    await transaction.execAsync(`CREATE TRIGGER IF NOT EXISTS search_documents_fts_delete
      AFTER DELETE ON search_documents BEGIN
        INSERT INTO search_documents_fts(
          search_documents_fts, rowid, account_id, document_id, title, location,
          provider_text, personal_note
        ) VALUES (
          'delete', old.rowid, old.account_id, old.document_id, old.title, old.location,
          old.provider_text, old.personal_note
        );
      END`);
    await transaction.execAsync(`CREATE TRIGGER IF NOT EXISTS search_documents_fts_update
      AFTER UPDATE ON search_documents BEGIN
        INSERT INTO search_documents_fts(
          search_documents_fts, rowid, account_id, document_id, title, location,
          provider_text, personal_note
        ) VALUES (
          'delete', old.rowid, old.account_id, old.document_id, old.title, old.location,
          old.provider_text, old.personal_note
        );
        INSERT INTO search_documents_fts(
          rowid, account_id, document_id, title, location, provider_text, personal_note
        ) VALUES (
          new.rowid, new.account_id, new.document_id, new.title, new.location,
          new.provider_text, new.personal_note
        );
      END`);
    await transaction.execAsync(
      "INSERT INTO search_documents_fts(search_documents_fts) VALUES ('rebuild')",
    );
  });
}

export function createOfflineCalendarSearch(database: OfflineSearchDatabase, accountId: string) {
  let indexReady: Promise<void> | undefined;
  const ensureIndex = () => {
    indexReady ??= ensureSearchIndex(database);
    return indexReady;
  };

  return {
    query: async (query: string, limit = 20): Promise<OfflineSearchResult[]> => {
      if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_SEARCH_RESULTS) {
        throw new RangeError(
          `Search limit must be an integer from 1 to ${String(MAX_SEARCH_RESULTS)}.`,
        );
      }
      const tokens = searchTokens(query);
      if (tokens.length === 0) return [];
      await ensureIndex();

      const rows = await database.getAllAsync<SearchRow>(
        `SELECT d.document_id,
                d.occurrence_id,
                d.title,
                d.location,
                d.provider_text,
                d.personal_note
           FROM search_documents_fts f
           JOIN search_documents d ON d.rowid = f.rowid
           LEFT JOIN cached_mission_occurrences o
             ON o.account_id = d.account_id
            AND o.occurrence_id = d.occurrence_id
          WHERE f.account_id = ?
            AND search_documents_fts MATCH ?
            AND (
              d.occurrence_id IS NULL
              OR (
                o.payload_json IS NOT NULL
                AND json_extract(o.payload_json, '$.deletionState') <> 'deleted'
              )
            )
          ORDER BY bm25(search_documents_fts), d.updated_at DESC, d.document_id
          LIMIT ?`,
        accountId,
        toFtsQuery(tokens),
        limit,
      );

      return rows.map((row) => ({
        documentId: row.document_id,
        occurrenceId: row.occurrence_id,
        title: row.title,
        location: row.location,
        providerText: row.provider_text,
        personalNoteExcerpt:
          row.personal_note !== null && personalNoteCausedMatch(row, tokens)
            ? personalNoteExcerpt(row.personal_note, tokens)
            : null,
      }));
    },
  };
}

export type OfflineCalendarSearch = ReturnType<typeof createOfflineCalendarSearch>;

export interface SearchSessionState {
  readonly query: string;
  readonly results: readonly OfflineSearchResult[];
}

export function createSearchSession(search: OfflineCalendarSearch) {
  let state: SearchSessionState = { query: '', results: [] };
  let generation = 0;
  return {
    getState: (): SearchSessionState => state,
    search: async (query: string): Promise<SearchSessionState> => {
      const requestGeneration = ++generation;
      const results = await search.query(query);
      if (requestGeneration === generation) {
        state = { query, results };
      }
      return state;
    },
    close: (): void => {
      generation += 1;
      state = { query: '', results: [] };
    },
  };
}

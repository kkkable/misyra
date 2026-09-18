import { calendarConnectionSchema, type CalendarConnection } from '@misyra/contracts';

type AppleCalendarConnection = Omit<CalendarConnection, 'provider'> &
  Readonly<{ provider: 'apple' }>;

type KeyValueStore = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}>;

export function appleCalendarConnectionCacheKey(accountId: string): string {
  return `misyra.apple-calendar-connection.v1:${accountId}`;
}

function parseAppleConnection(value: string): AppleCalendarConnection | null {
  try {
    const parsed = calendarConnectionSchema.safeParse(JSON.parse(value) as unknown);
    if (!parsed.success || parsed.data.provider !== 'apple') return null;
    return { ...parsed.data, provider: 'apple' };
  } catch {
    return null;
  }
}

export function createAppleCalendarConnectionCache(store: KeyValueStore) {
  return Object.freeze({
    async read(accountId: string): Promise<AppleCalendarConnection | null> {
      const value = await store.getItem(appleCalendarConnectionCacheKey(accountId));
      return value === null ? null : parseAppleConnection(value);
    },
    write(accountId: string, connection: AppleCalendarConnection): Promise<void> {
      return store.setItem(appleCalendarConnectionCacheKey(accountId), JSON.stringify(connection));
    },
    clear(accountId: string): Promise<void> {
      return store.deleteItem(appleCalendarConnectionCacheKey(accountId));
    },
  });
}

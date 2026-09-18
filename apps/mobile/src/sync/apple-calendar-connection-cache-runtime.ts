import * as SecureStore from 'expo-secure-store';

import { calendarConnectionSchema, type CalendarConnection } from '@misyra/contracts';

const APPLE_CONNECTION_CACHE_KEY_PREFIX = 'misyra.apple-calendar-connection.v1:';

type AppleCalendarConnection = Omit<CalendarConnection, 'provider'> &
  Readonly<{ provider: 'apple' }>;

function cacheKey(accountId: string) {
  return `${APPLE_CONNECTION_CACHE_KEY_PREFIX}${accountId}`;
}

function parseAppleConnection(value: string | null): AppleCalendarConnection | null {
  if (value === null) return null;
  try {
    const parsed = calendarConnectionSchema.safeParse(JSON.parse(value) as unknown);
    if (!parsed.success || parsed.data.provider !== 'apple') return null;
    return { ...parsed.data, provider: 'apple' };
  } catch {
    return null;
  }
}

export const rootAppleCalendarConnectionCache = Object.freeze({
  async read(accountId: string): Promise<AppleCalendarConnection | null> {
    return parseAppleConnection(await SecureStore.getItemAsync(cacheKey(accountId)));
  },
  async write(accountId: string, connection: AppleCalendarConnection): Promise<void> {
    await SecureStore.setItemAsync(cacheKey(accountId), JSON.stringify(connection));
  },
  async clear(accountId: string): Promise<void> {
    await SecureStore.deleteItemAsync(cacheKey(accountId));
  },
});

import type { CalendarConnection } from '@misyra/contracts';

import type { AppleCalendarNativeModule as AppleCalendarNativeModuleType } from '../../modules/apple-calendar/index.js';
import { createMutationQueue } from '../storage/mutation-queue.js';
import {
  createAppleCalendarMobileSync,
  createAppleCalendarSqliteSyncStore,
  type AppleCalendarSyncDatabase,
} from './apple-calendar-mobile-sync.js';

type AppleCalendarConnection = Omit<CalendarConnection, 'provider'> & Readonly<{ provider: 'apple' }>;

type ConnectionCache = Readonly<{
  read(accountId: string): Promise<AppleCalendarConnection | null>;
  write(accountId: string, connection: AppleCalendarConnection): Promise<void>;
  clear(accountId: string): Promise<void>;
}>;

type DeviceSync = Readonly<{
  runForeground(): Promise<unknown>;
  runBestEffortBackground(): Promise<unknown>;
}>;

type CreateSyncInput = Readonly<{
  database: AppleCalendarSyncDatabase;
  accountId: string;
  deviceId: string;
  connection: AppleCalendarConnection;
  nativeModule: AppleCalendarNativeModuleType;
  generateId: () => string;
}>;

type DeviceRuntimeOptions = Readonly<{
  platform: string;
  nativeModule: AppleCalendarNativeModuleType | null;
  accountIdProvider: () => Promise<string | null>;
  registeredDeviceIdProvider: (accountId: string) => Promise<string | null>;
  remoteConnectionProvider: (accountId: string) => Promise<CalendarConnection | null>;
  connectionCache: ConnectionCache;
  openDatabase: () => Promise<AppleCalendarSyncDatabase>;
  generateId: () => string;
  createSync?: (input: CreateSyncInput) => DeviceSync;
}>;

type DeviceRuntimeInactiveReason =
  | 'platform_unavailable'
  | 'adapter_unavailable'
  | 'account_unavailable'
  | 'device_unregistered'
  | 'connection_inactive'
  | 'background_unavailable';

type DeviceRuntimeInactive = Readonly<{
  status: 'inactive';
  reason: DeviceRuntimeInactiveReason;
}>;

function connectedApple(value: CalendarConnection | null): AppleCalendarConnection | null {
  return value?.provider === 'apple' && value.state === 'connected' ? { ...value, provider: 'apple' } : null;
}

function defaultCreateSync(input: CreateSyncInput): DeviceSync {
  const mutationQueue = createMutationQueue(input.database, input.accountId);
  const store = createAppleCalendarSqliteSyncStore({
    database: input.database,
    mutationQueue,
    accountId: input.accountId,
    deviceId: input.deviceId,
    generateId: input.generateId,
  });
  return createAppleCalendarMobileSync({
    accountId: input.accountId,
    deviceId: input.deviceId,
    connection: input.connection,
    nativeModule: input.nativeModule,
    store,
    generateId: input.generateId,
  });
}

export function createAppleCalendarDeviceRuntime(options: DeviceRuntimeOptions) {
  const createSync = options.createSync ?? defaultCreateSync;
  let nativeSubscription: { remove(): void } | null = null;
  let subscriptionOwners = 0;

  const resolveSync = async (): Promise<DeviceSync | DeviceRuntimeInactive> => {
    if (options.platform !== 'ios') {
      return { status: 'inactive', reason: 'platform_unavailable' };
    }
    if (options.nativeModule === null) {
      return { status: 'inactive', reason: 'adapter_unavailable' };
    }

    const accountId = await options.accountIdProvider();
    if (accountId === null) {
      return { status: 'inactive', reason: 'account_unavailable' };
    }

    let connection: AppleCalendarConnection | null;
    try {
      const remote = await options.remoteConnectionProvider(accountId);
      connection = connectedApple(remote);
      if (connection === null) {
        await options.connectionCache.clear(accountId);
      } else {
        await options.connectionCache.write(accountId, connection);
      }
    } catch {
      connection = await options.connectionCache.read(accountId);
      if (connection?.state !== 'connected') connection = null;
    }
    if (connection === null) {
      return { status: 'inactive', reason: 'connection_inactive' };
    }

    const deviceId = await options.registeredDeviceIdProvider(accountId);
    if (deviceId === null || deviceId.length === 0) {
      return { status: 'inactive', reason: 'device_unregistered' };
    }

    const database = await options.openDatabase();
    return createSync({
      database,
      accountId,
      deviceId,
      connection,
      nativeModule: options.nativeModule,
      generateId: options.generateId,
    });
  };

  const runForeground = async () => {
    const resolved = await resolveSync();
    if ('status' in resolved) return resolved;
    return resolved.runForeground();
  };

  const runBestEffortBackground = async () => {
    try {
      const resolved = await resolveSync();
      if ('status' in resolved) return resolved;
      return await resolved.runBestEffortBackground();
    } catch {
      return { status: 'inactive', reason: 'background_unavailable' } as const;
    }
  };

  return Object.freeze({
    runForeground,
    runBestEffortBackground,
    subscribeStoreChanges() {
      if (options.platform !== 'ios' || options.nativeModule === null) {
        return { remove() {} };
      }
      subscriptionOwners += 1;
      if (nativeSubscription === null) {
        nativeSubscription = options.nativeModule.addListener('onStoreChanged', () => {
          void runBestEffortBackground();
        });
      }
      let removed = false;
      return {
        remove() {
          if (removed) return;
          removed = true;
          subscriptionOwners -= 1;
          if (subscriptionOwners === 0) {
            nativeSubscription?.remove();
            nativeSubscription = null;
          }
        },
      };
    },
  });
}

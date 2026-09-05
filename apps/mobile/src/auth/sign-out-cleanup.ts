import { wipeAccountData, type MigrationDatabase } from '../storage/schema.js';

export type SignOutCleanupHooks = Readonly<{
  stopSync?: (accountId: string) => Promise<void>;
  cancelNotifications?: (accountId: string) => Promise<void>;
  clearWorkingMedia?: (accountId: string) => Promise<void>;
  clearFeedbackDraft?: (accountId: string) => Promise<void>;
  clearAppKeys?: (accountId: string) => Promise<void>;
}>;

type SignOutCleanupOptions = Readonly<{
  openDatabase: () => Promise<MigrationDatabase>;
  hooks?: SignOutCleanupHooks;
}>;

export function createSignOutCleanup({ openDatabase, hooks = {} }: SignOutCleanupOptions) {
  return async (accountId: string) => {
    const failures: unknown[] = [];

    async function attempt(operation: () => Promise<void>) {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    }

    await attempt(() => hooks.stopSync?.(accountId) ?? Promise.resolve());
    await attempt(() => hooks.cancelNotifications?.(accountId) ?? Promise.resolve());
    await attempt(() => hooks.clearWorkingMedia?.(accountId) ?? Promise.resolve());
    await attempt(() => hooks.clearFeedbackDraft?.(accountId) ?? Promise.resolve());
    await attempt(async () => {
      const database = await openDatabase();
      await wipeAccountData(database, accountId);
    });
    await attempt(() => hooks.clearAppKeys?.(accountId) ?? Promise.resolve());

    if (failures.length > 0) throw failures[0];
  };
}

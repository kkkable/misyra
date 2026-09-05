import { openMobileDatabase } from '../storage/database.js';
import { wipeAccountData, type MigrationDatabase } from '../storage/schema.js';

export type SignOutCleanupHooks = Readonly<{
  stopSync?: (accountId: string) => Promise<void>;
  cancelNotifications?: (accountId: string) => Promise<void>;
  clearWorkingMedia?: (accountId: string) => Promise<void>;
  clearFeedbackDraft?: (accountId: string) => Promise<void>;
  clearAppKeys?: (accountId: string) => Promise<void>;
}>;

type SignOutCleanupOptions = Readonly<{
  openDatabase?: () => Promise<MigrationDatabase>;
  hooks?: SignOutCleanupHooks;
}>;

export function createSignOutCleanup({
  openDatabase = openMobileDatabase,
  hooks = {},
}: SignOutCleanupOptions = {}) {
  return async (accountId: string) => {
    await hooks.stopSync?.(accountId);
    await hooks.cancelNotifications?.(accountId);
    await hooks.clearWorkingMedia?.(accountId);
    await hooks.clearFeedbackDraft?.(accountId);

    const database = await openDatabase();
    await wipeAccountData(database, accountId);

    await hooks.clearAppKeys?.(accountId);
  };
}

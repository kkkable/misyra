import type { Pool } from 'pg';

export type AccountDeletionResult = Readonly<{
  deleted: true;
}>;

export function deleteAccountTransaction(
  pool: Pool,
  accountId: string,
): Promise<AccountDeletionResult> {
  void pool;
  void accountId;
  return Promise.reject(new Error('account_deletion_not_implemented'));
}

import type { Pool } from 'pg';

export type AccountDeletionResult = Readonly<{
  deleted: true;
}>;

export async function deleteAccountTransaction(
  _pool: Pool,
  _accountId: string,
): Promise<AccountDeletionResult> {
  throw new Error('account_deletion_not_implemented');
}

import * as SQLite from 'expo-sqlite';

import { applyMobileMigrations, type MigrationDatabase } from './schema.js';

export const MOBILE_DATABASE_NAME = 'misyra.db';

export async function openMobileDatabase(
  databaseName: string = MOBILE_DATABASE_NAME,
): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(databaseName);
  await applyMobileMigrations(database as MigrationDatabase);
  return database;
}

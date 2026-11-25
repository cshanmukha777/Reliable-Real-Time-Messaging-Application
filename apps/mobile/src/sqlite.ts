import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { migrate, type LocalDatabase, type SqlExecutor } from './sqlite-core';

function executor(database: SQLiteDatabase): SqlExecutor {
  return {
    exec: (sql) => database.execAsync(sql),
    async run(sql, ...parameters) {
      await database.runAsync(sql, parameters);
    },
    first: (sql, ...parameters) => database.getFirstAsync(sql, parameters),
  };
}

export async function openLocalDatabase(name: string): Promise<LocalDatabase> {
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  const adapter: LocalDatabase = {
    ...executor(database),
    transaction: (work) =>
      database.withExclusiveTransactionAsync((tx) => work(executor(tx))),
    close: () => database.closeAsync(),
  };
  try {
    await adapter.exec('PRAGMA journal_mode = WAL');
    await migrate(adapter);
    return adapter;
  } catch (error) {
    await adapter.close().catch(() => undefined);
    throw new Error('Local storage could not be initialized.', {
      cause: error,
    });
  }
}

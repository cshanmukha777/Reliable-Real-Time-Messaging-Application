import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
  migrate,
  type LocalDatabase,
  type QueryParameter,
  type SqlExecutor,
} from './sqlite-core';

function executor(database: SQLiteDatabase): SqlExecutor {
  return {
    exec: (sql) => database.execAsync(sql),
    async run(sql, ...parameters) {
      await database.runAsync(sql, parameters);
    },
    first: (sql, ...parameters) => database.getFirstAsync(sql, parameters),
    all: (sql, ...parameters) => database.getAllAsync(sql, parameters),
  };
}

export async function openLocalDatabase(
  name: string,
  account = false,
): Promise<LocalDatabase> {
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  const raw = executor(database);
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;
  const serialize = <T>(work: () => Promise<T>) => {
    if (closed) return Promise.reject(new Error('Local storage is closed.'));
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  };
  const adapter: LocalDatabase = {
    exec: (sql) => serialize(() => raw.exec(sql)),
    run: (sql, ...args) => serialize(() => raw.run(sql, ...args)),
    first: <T>(sql: string, ...args: QueryParameter[]) =>
      serialize(() => raw.first<T>(sql, ...args)),
    all: <T>(sql: string, ...args: QueryParameter[]) =>
      serialize(() => raw.all<T>(sql, ...args)),
    transaction: (work) =>
      serialize(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await work(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          await raw.exec('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }),
    close: async () => {
      if (closed) return;
      closed = true;
      await tail;
      await database.closeAsync();
    },
  };
  try {
    await adapter.exec(
      'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;',
    );
    await migrate(adapter, account);
    return adapter;
  } catch (error) {
    await adapter.close().catch(() => undefined);
    throw new Error('Local storage could not be initialized.', {
      cause: error,
    });
  }
}

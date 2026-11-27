import { offlineSchema } from './offline/schema.ts';

export type QueryParameter = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, ...parameters: QueryParameter[]): Promise<void>;
  all<T>(sql: string, ...parameters: QueryParameter[]): Promise<T[]>;
  first<T>(sql: string, ...parameters: QueryParameter[]): Promise<T | null>;
}

export interface LocalDatabase extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface KeyValueRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ProbeRepository {
  create(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  remove(id: string): Promise<void>;
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE app_preference (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE foundation_probe (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL);
    `,
  },
];

export async function migrate(
  database: LocalDatabase,
  account = false,
): Promise<void> {
  const versions = account
    ? [...migrations, { version: 2, sql: offlineSchema }]
    : migrations;
  await database.transaction(async (tx) => {
    const row = await tx.first<{ user_version: number }>('PRAGMA user_version');
    if (!row || row.user_version > versions.length || row.user_version < 0) {
      throw new Error('This SQLite schema version is unsupported.');
    }
    for (const migration of versions) {
      if (migration.version <= row.user_version) continue;
      await tx.exec(migration.sql);
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    }
  });
}

export function preferencesRepository(db: SqlExecutor): KeyValueRepository {
  return {
    async get(key) {
      return (
        (
          await db.first<{ value: string }>(
            'SELECT value FROM app_preference WHERE key = ?',
            key,
          )
        )?.value ?? null
      );
    },
    set(key, value) {
      return db.run(
        'INSERT INTO app_preference (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    },
    remove(key) {
      return db.run('DELETE FROM app_preference WHERE key = ?', key);
    },
  };
}

export function probeRepository(db: SqlExecutor): ProbeRepository {
  return {
    create(id) {
      return db.run(
        'INSERT INTO foundation_probe (id, created_at) VALUES (?, ?)',
        id,
        new Date().toISOString(),
      );
    },
    async exists(id) {
      return (
        (await db.first('SELECT id FROM foundation_probe WHERE id = ?', id)) !==
        null
      );
    },
    remove(id) {
      return db.run('DELETE FROM foundation_probe WHERE id = ?', id);
    },
  };
}

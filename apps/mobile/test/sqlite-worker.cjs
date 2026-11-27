const { DatabaseSync } = require('node:sqlite');
const {
  migrate,
  preferencesRepository,
  probeRepository,
} = require('../src/sqlite-core.ts');

function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
  const executor = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, ...parameters) {
      db.prepare(sql).run(...parameters);
    },
    async all(sql, ...parameters) {
      return db.prepare(sql).all(...parameters);
    },
    async first(sql, ...parameters) {
      return db.prepare(sql).get(...parameters) ?? null;
    },
  };
  return {
    ...executor,
    async transaction(work) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(executor);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}

module.exports = { openDatabase };

if (require.main === module) {
  const [path, id] = process.argv.slice(2);
  void (async () => {
    const db = openDatabase(path);
    try {
      await migrate(db);
      const preferences = preferencesRepository(db);
      console.log(
        JSON.stringify({
          probe: await probeRepository(db).exists(id),
          origin: await preferences.get('backend.origin'),
          appearance: await preferences.get('appearance'),
          schema: (await db.first('PRAGMA user_version')).user_version,
        }),
      );
    } finally {
      await db.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

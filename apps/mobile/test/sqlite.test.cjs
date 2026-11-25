const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const {
  migrate,
  preferencesRepository,
  probeRepository,
} = require('../src/sqlite-core.ts');
const { openDatabase } = require('./sqlite-worker.cjs');

test('SQLite migrations, preferences and probe survive reopening in a fresh process', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'chatapp-sqlite-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'probe.db');
  const db = openDatabase(file);
  const id = randomUUID();
  const origin = 'https://api.example.com';
  try {
    await migrate(db);
    await migrate(db);
    await db.transaction(async (tx) => {
      await preferencesRepository(tx).set('backend.origin', origin);
      await preferencesRepository(tx).set('appearance', 'dark');
      await probeRepository(tx).create(id);
    });
    await assert.rejects(
      db.transaction(async (tx) => {
        await preferencesRepository(tx).set(
          'backend.origin',
          'https://rollback.example.com',
        );
        throw new Error('rollback');
      }),
      /rollback/,
    );
  } finally {
    await db.close();
  }

  const reopened = spawnSync(
    process.execPath,
    [join(__dirname, 'sqlite-worker.cjs'), file, id],
    { encoding: 'utf8' },
  );
  assert.equal(reopened.status, 0, reopened.stderr);
  assert.deepEqual(JSON.parse(reopened.stdout), {
    probe: true,
    origin,
    appearance: 'dark',
    schema: 1,
  });
});

test('failed SQLite migration leaves the version and prior data intact', async () => {
  const db = openDatabase(':memory:');
  try {
    await db.exec('CREATE TABLE foundation_probe (id TEXT PRIMARY KEY);');
    await db.run('INSERT INTO foundation_probe (id) VALUES (?)', 'existing');
    await assert.rejects(migrate(db), /already exists/);
    assert.equal((await db.first('PRAGMA user_version')).user_version, 0);
    assert.equal(
      (await db.first('SELECT id FROM foundation_probe')).id,
      'existing',
    );
    assert.equal(
      await db.first(
        "SELECT name FROM sqlite_master WHERE name = 'app_preference'",
      ),
      null,
    );
  } finally {
    await db.close();
  }
});

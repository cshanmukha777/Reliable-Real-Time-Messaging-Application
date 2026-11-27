const { openDatabase } = require('./sqlite-worker.cjs');
const { migrate } = require('../src/sqlite-core.ts');
const { OfflineStore } = require('../src/offline/store.ts');

const [path, thread, operation, mode] = process.argv.slice(2);
(async () => {
  const db = openDatabase(path);
  try {
    await migrate(db, true);
    const store = new OfflineStore(db, 'a'.repeat(24));
    if (mode === 'crash') {
      await store.saveDraft(thread, { body: 'Independent draft', file: null });
      await store.claim('crashed lease', 1500000000000, 1500000000500);
      process.kill(process.pid, 'SIGKILL');
    }
    if (mode?.startsWith('claim-')) {
      const job = await store.claim(mode, 1500000000000, 1500000045000);
      console.log(JSON.stringify(job?.id ?? null));
      return;
    }
    const row = await db.first(
      'SELECT body,lease FROM outbox_operations WHERE id=?',
      operation,
    );
    console.log(
      JSON.stringify({
        ...row,
        draft: (await store.getDraft(thread)).body,
        attachment: (await store.attachment(operation)).file.id,
      }),
    );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

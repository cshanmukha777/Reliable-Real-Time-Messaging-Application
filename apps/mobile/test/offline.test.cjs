const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const {
  migrate,
  preferencesRepository,
  probeRepository,
} = require('../src/sqlite-core.ts');
const { OfflineStore } = require('../src/offline/store.ts');
const { OutboxWorker, classify } = require('../src/offline/worker.ts');
const { MessagingError } = require('../src/messaging/api.ts');
const { retryDelay } = require('../src/retry-after.ts');
const { openDatabase } = require('./sqlite-worker.cjs');

const me = { id: 'a'.repeat(24), displayName: 'Local sender', avatarUrl: null };
const thread = 'b'.repeat(24);
const canonical = 'c'.repeat(24);
const file = {
  id: randomUUID(),
  input: { fileName: 'notes.txt', mimeType: 'text/plain', size: 12 },
  checksum: 'example',
};
const remoteFile = { ...file.input, id: 'd'.repeat(24) };
const time = 1500000000000;
const conversation = {
  id: thread,
  title: 'Test thread',
  kind: 'DIRECT',
  role: 'MEMBER',
  members: [{ ...me, role: 'MEMBER' }],
  latest: null,
  updatedAt: new Date(time).toISOString(),
};
const history = (items = [], visibleFrom = 1) => ({
  items,
  visibleFrom,
  nextCursor: null,
});
function remote(body, attachments = []) {
  return {
    id: canonical,
    conversationId: thread,
    body,
    sender: me,
    createdAt: new Date(time + 20).toISOString(),
    attachments,
    deleted: false,
  };
}

async function setup(path = ':memory:') {
  const db = openDatabase(path);
  await migrate(db, true);
  const store = new OfflineStore(db, me.id);
  await store.cacheConversations([conversation]);
  return store;
}
async function queued(
  store,
  { body = 'Saved locally', attachment = null } = {},
) {
  const id = randomUUID();
  await store.saveDraft(thread, { body, file: attachment }, time);
  await store.enqueue(thread, id, me, time);
  return id;
}
function worker(store, services = {}) {
  return new OutboxWorker(store, {
    uuid: randomUUID,
    eligible: () => true,
    now: () => time + 10_000,
    random: () => 0,
    verify: async () => history(),
    recoverUpload: async () => ({ ready: true, attachment: remoteFile }),
    upload: async () => {},
    complete: async () => remoteFile,
    send: async (_id, { body }) => remote(body),
    ...services,
  });
}

test('account schema upgrades in place and preserves existing preferences and diagnostic probes', async () => {
  const db = openDatabase(':memory:');
  try {
    await migrate(db);
    await preferencesRepository(db).set('appearance', 'dark');
    await probeRepository(db).create('before-upgrade');
    await migrate(db, true);
    await migrate(db, true);
    assert.equal((await db.first('PRAGMA user_version')).user_version, 2);
    assert.equal((await db.first('PRAGMA foreign_keys')).foreign_keys, 1);
    assert.equal(await preferencesRepository(db).get('appearance'), 'dark');
    assert.equal(await probeRepository(db).exists('before-upgrade'), true);
  } finally {
    await db.close();
  }
});

test('failed enqueue rolls back the operation and preserves draft and staged file', async () => {
  const store = await setup();
  try {
    await store.saveDraft(thread, { body: 'Keep this', file });
    await store.db.exec(
      "CREATE TRIGGER simulated_failure BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'disk failure'); END;",
    );
    await assert.rejects(
      store.enqueue(thread, randomUUID(), me),
      /disk failure/,
    );
    assert.equal((await store.getDraft(thread)).body, 'Keep this');
    assert.equal((await store.getDraft(thread)).file.id, file.id);
    assert.deepEqual(await store.db.all('SELECT * FROM outbox_operations'), []);
    assert.deepEqual((await store.thread(thread)).rows, []);
    await assert.rejects(
      store.enqueue(thread, randomUUID(), { ...me, id: 'e'.repeat(24) }),
      /ACCOUNT_SCOPE/,
    );
  } finally {
    await store.db.close();
  }
});

test('a fresh process reads the original draft, operation and file reference; an expired lease recovers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-offline-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const path = join(root, 'account.db');
  const first = await setup(path);
  const id = await queued(first, { attachment: file });
  await first.db.close();
  const crash = spawnSync(
    process.execPath,
    [join(__dirname, 'offline-restart.cjs'), path, thread, id, 'crash'],
    { encoding: 'utf8' },
  );
  assert.equal(crash.signal, 'SIGKILL', crash.stderr);
  const result = spawnSync(
    process.execPath,
    [join(__dirname, 'offline-restart.cjs'), path, thread, id],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    body: 'Saved locally',
    draft: 'Independent draft',
    attachment: file.id,
    lease: 'crashed lease',
  });
  const second = await setup(path);
  try {
    assert.equal(await second.claim('too early', time + 200, time + 800), null);
    const recovered = await second.claim('new lease', time + 501, time + 800);
    assert.equal(recovered.id, id);
    const peer = openDatabase(path);
    try {
      const other = new OfflineStore(peer, me.id);
      assert.equal(await other.claim('race', time + 502, time + 900), null);
      const priorOwner = { ...recovered, lease: 'crashed lease' };
      assert.equal(
        await other.renew(priorOwner, time + 502, time + 900),
        false,
      );
      assert.equal(await second.renew(recovered, time + 503, time + 900), true);
      assert.equal(
        await other.claim('still leased', time + 800, time + 1000),
        null,
      );
    } finally {
      await peer.close();
    }
  } finally {
    await second.db.close();
  }
});

test('lost response and process restart reuse the frozen message UUID and payload', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-reply-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const path = join(root, 'account.db');
  let store = await setup(path);
  const id = await queued(store, { attachment: file });
  const calls = [];
  const send = async (_key, input) => {
    calls.push(input);
    if (calls.length === 1) throw new TypeError('connection gone after commit');
    return remote(input.body, [remoteFile]);
  };
  await worker(store, { send }).processNext();
  assert.equal((await store.thread(thread)).rows[0].state, 'RETRY_WAIT');
  await store.db.close();
  store = await setup(path);
  try {
    await worker(store, { send, now: () => time + 20_000 }).processNext();
    assert.deepEqual(calls, [
      {
        clientMessageId: id,
        body: 'Saved locally',
        attachmentIds: [remoteFile.id],
      },
      calls[0],
    ]);
    const rows = (await store.thread(thread)).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].message.id, canonical);
    assert.equal(rows[0].state, 'CONFIRMED');
    assert.equal((await store.unusedFiles())[0].id, file.id);
  } finally {
    await store.db.close();
  }
});

test('history acknowledgement replaces the optimistic bubble and tombstones cannot be overwritten', async () => {
  const store = await setup();
  try {
    const id = await queued(store);
    let sends = 0;
    await worker(store, {
      verify: async () =>
        history([{ ...remote('Saved locally'), clientMessageId: id }]),
      send: async () => {
        sends++;
        return remote('Saved locally');
      },
    }).processNext();
    assert.equal(sends, 0);
    assert.equal((await store.thread(thread)).rows.length, 1);
    await store.removeCached(remote('Saved locally'));
    await store.applyHistory(thread, history([remote('stale')]));
    assert.equal((await store.thread(thread)).rows[0].message.deleted, true);
    assert.equal((await store.thread(thread)).rows[0].message.body, '');
  } finally {
    await store.db.close();
  }
});

test('interrupted PUT recovers the same attachment without uploading twice', async () => {
  const store = await setup();
  try {
    const id = await queued(store, { attachment: file });
    let put = 0;
    const recoverUpload = async (_thread, key) => {
      assert.equal(key, file.id);
      return put
        ? { ready: true, attachment: remoteFile }
        : {
            url: 'https://private.example.test',
            headers: {},
            attachment: remoteFile,
          };
    };
    const upload = async () => {
      put++;
      throw new TypeError('lost PUT response');
    };
    const send = async (_thread, input) => {
      assert.equal(input.clientMessageId, id);
      assert.deepEqual(input.attachmentIds, [remoteFile.id]);
      return remote(input.body, [remoteFile]);
    };
    await worker(store, { recoverUpload, upload, send }).processNext();
    await worker(store, {
      recoverUpload,
      upload,
      send,
      now: () => time + 30_000,
    }).processNext();
    assert.equal(put, 1);
    assert.equal((await store.thread(thread)).rows[0].state, 'CONFIRMED');
  } finally {
    await store.db.close();
  }
});

test('revocation and changed membership boundary preserve drafts and stop old operations', async () => {
  const store = await setup();
  try {
    const id = await queued(store);
    await store.applyHistory(
      thread,
      history([remote('Previously visible body')]),
    );
    await store.saveDraft(thread, { body: 'Retain privately', file: null });
    await worker(store, {
      verify: async () => {
        throw new MessagingError(404, 'NOT_FOUND');
      },
    }).processNext();
    assert.deepEqual(await store.inbox(), []);
    assert.equal((await store.thread(thread)).rows.length, 1);
    await store.cacheConversations([conversation]);
    await store.applyHistory(thread, history([], 2));
    assert.equal((await store.thread(thread)).rows[0].state, 'BLOCKED_ACCESS');
    assert.equal((await store.getDraft(thread)).body, 'Retain privately');
    assert.equal(await store.claim(id, time + 100_000, time + 120_000), null);
  } finally {
    await store.db.close();
  }
});

test('missing files fail durably and transient retry honors server delays', async () => {
  assert.equal(retryDelay('75', time), 75000);
  assert.equal(retryDelay(new Date(time + 60000).toUTCString(), time), 60000);
  assert.equal(
    classify(new MessagingError(429, 'TOO_MANY_REQUESTS', 75000), 3, () => 0)
      .delay,
    75000,
  );
  assert.equal(
    classify(new MessagingError(409, 'CONFLICT'), 1).state,
    'FAILED',
  );
  assert.equal(
    classify(new MessagingError(503, 'SERVICE_UNAVAILABLE'), 1).state,
    'RETRY_WAIT',
  );
  const store = await setup();
  try {
    await queued(store, { attachment: file });
    await worker(store, {
      recoverUpload: async () => ({
        url: 'https://private.example.test',
        headers: {},
        attachment: remoteFile,
      }),
      upload: async () => {
        throw new Error('FILE_MISSING');
      },
    }).processNext();
    const row = (await store.thread(thread)).rows[0];
    assert.equal(row.error, 'FILE_MISSING');
    assert.equal(row.state, 'FAILED');
    assert.equal(row.file.id, file.id);
  } finally {
    await store.db.close();
  }
});

test('when the account scope changes during upload, no subsequent send can start', async () => {
  const store = await setup();
  try {
    await queued(store, { attachment: file });
    let eligible = true;
    let sends = 0;
    const task = worker(store, {
      eligible: () => eligible,
      recoverUpload: async () => ({
        url: 'https://private.example.test',
        headers: {},
        attachment: remoteFile,
      }),
      upload: async () => {
        eligible = false;
      },
      send: async () => {
        sends++;
        return remote('Wrong account');
      },
    });
    await task.processNext();
    assert.equal(sends, 0);
    assert.equal((await store.thread(thread)).rows[0].state, 'RETRY_WAIT');
  } finally {
    await store.db.close();
  }
});

test('staged files survive picker cleanup and a fresh adapter, with scoped corruption detection', async (t) => {
  const fs = require('node:fs/promises');
  const { createHash } = require('node:crypto');
  const { createStaging } = require('../src/offline/staging.ts');
  const folder = await mkdtemp(join(tmpdir(), 'chatapp-stage-files-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const io = {
    initialize: (path) => fs.mkdir(path, { recursive: true }),
    copy: fs.copyFile,
    move: fs.rename,
    remove: (path) => fs.rm(path, { force: true }),
    list: fs.readdir,
    async info(path, checksum) {
      try {
        const stat = await fs.stat(path);
        return {
          size: stat.size,
          updatedAt: stat.mtimeMs,
          ...(checksum && {
            checksum: createHash('md5')
              .update(await fs.readFile(path))
              .digest('hex'),
          }),
        };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
  const staging = (scope) =>
    createStaging(join(folder, scope) + '/', io, randomUUID);
  const picker = join(folder, 'temporary-picker-file.txt');
  const bytes = Buffer.from('copied attachment');
  await fs.writeFile(picker, bytes);
  const staged = await staging('first').stage({
    uri: picker,
    input: {
      fileName: 'saved.txt',
      size: bytes.length,
      mimeType: 'text/plain',
    },
  });
  await fs.rm(picker);
  const restarted = staging('first');
  assert.deepEqual(
    await fs.readFile((await restarted.validate(staged)).uri),
    bytes,
  );
  await assert.rejects(
    staging('other-backend').validate(staged),
    /FILE_MISSING/,
  );
  const orphan = restarted.path(randomUUID()) + '.part';
  await fs.writeFile(orphan, 'incomplete copy');
  await restarted.sweep(new Set([staged.id]), Date.now() + 90_000_000);
  assert.equal(await io.info(orphan, false), null);
  await fs.writeFile(
    restarted.path(staged.id),
    Buffer.alloc(bytes.length, 'x'),
  );
  await assert.rejects(restarted.validate(staged), /FILE_CHANGED/);
  await restarted.discard(staged.id);
  await assert.rejects(restarted.validate(staged), /FILE_MISSING/);
});

test('two running processes contend for one durable claim', async (t) => {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const run = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), 'chatapp-lease-race-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'account.db');
  const store = await setup(path);
  const id = await queued(store);
  await store.db.close();
  const script = join(__dirname, 'offline-restart.cjs');
  const claims = await Promise.all(
    ['claim-one', 'claim-two'].map((mode) =>
      run(process.execPath, [script, path, thread, id, mode]).then(
        ({ stdout }) => JSON.parse(stdout),
      ),
    ),
  );
  assert.equal(claims.filter((claim) => claim === id).length, 1);
  assert.equal(claims.filter((claim) => claim === null).length, 1);
});

test('a late history or inbox response cannot restore content after a known revocation', async () => {
  const store = await setup();
  try {
    const previous = store.membershipRevision();
    await store.applyHistory(thread, history([remote('Before revocation')]));
    await store.revoke(thread);
    await store.cacheConversations([conversation], previous);
    await store.applyHistory(
      thread,
      history([remote('Stale payload')]),
      time,
      conversation,
      previous,
    );
    assert.deepEqual(await store.inbox(), []);
    const saved = await store.thread(thread);
    assert.equal(saved.active, false);
    assert.deepEqual(saved.rows, []);
    assert.deepEqual(saved.conversation.members, []);
    assert.equal(saved.conversation.latest, null);
  } finally {
    await store.db.close();
  }
});

test('the latest acknowledged draft edit survives an immediate process kill', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-draft-kill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'account.db');
  const before = await setup(path);
  const operation = await queued(before);
  await before.db.close();
  const child = spawnSync(process.execPath, [join(__dirname, 'offline-restart.cjs'), path, thread, operation, 'draft-kill']);
  assert.equal(child.signal, 'SIGKILL');
  const after = await setup(path);
  try {
    assert.equal((await after.getDraft(thread)).body, 'Just committed edit');
    assert.equal((await after.thread(thread)).rows[0].message.body, 'Saved locally');
  } finally { await after.db.close(); }
});

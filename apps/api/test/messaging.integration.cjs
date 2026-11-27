const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const {
  conversationSchema,
  messagePageSchema,
  messageSchema,
  peopleSchema,
  searchPageSchema,
} = require('@chatapp/contracts');
const { createApplication } = require('../dist/application.js');
const { loadEnvironment } = require('../dist/config/environment.js');
const { AttachmentStorage } = require('../dist/messaging/storage.js');
const { prepareMessaging } = require('../prisma/messaging-indexes.cjs');

test(
  'real replica set enforces messaging invariants over authenticated REST',
  { timeout: 90000 },
  async (t) => {
    const raw = process.env.CHATAPP_TEST_DATABASE_URL ?? '';
    assert.match(raw, /^mongodb:\/\/127\.0\.0\.1:\d+\/chatapp_test\?/);
    const url = new URL(raw);
    assert.equal(url.searchParams.get('directConnection'), 'true');
    assert.ok(url.searchParams.get('replicaSet'));
    url.pathname = `/chatapp_test_messaging_${randomBytes(8).toString('hex')}`;
    const endpoint = process.env.CHATAPP_TEST_S3_ENDPOINT;
    const bucket = `chatapp-test-${randomBytes(8).toString('hex')}`;
    const environment = loadEnvironment({
      DATABASE_URL: url.href,
      AUTH_SIGNING_KEY: randomBytes(32).toString('hex'),
      NODE_ENV: 'test',
      ...(endpoint && {
        S3_ENDPOINT: endpoint,
        S3_BUCKET: bucket,
        S3_ACCESS_KEY_ID: process.env.CHATAPP_TEST_S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: process.env.CHATAPP_TEST_S3_SECRET_ACCESS_KEY,
      }),
    });
    const db = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
    t.after(async () => {
      try {
        await db.$runCommandRaw({ dropDatabase: 1 });
      } finally {
        await db.$disconnect();
      }
    });
    const schema = spawnSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
      ],
      {
        cwd: join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: environment.DATABASE_URL },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    assert.equal(schema.status, 0, schema.stderr);
    await prepareMessaging(db);
    await prepareMessaging(db);
    const indexes = await db.$runCommandRaw({ listIndexes: 'messages' });
    assert.ok(
      indexes.cursor.firstBatch.some(
        (index) =>
          index.name === 'messages_conversation_body_text' &&
          index.key.conversationId === 1 &&
          index.weights.body === 1,
      ),
    );
    const app = await createApplication(environment);
    t.after(() => app.close());
    const uploads = new Map();
    if (endpoint) {
      const s3 = new S3Client({
        endpoint,
        forcePathStyle: true,
        region: environment.S3_REGION,
        credentials: {
          accessKeyId: environment.S3_ACCESS_KEY_ID,
          secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
        },
      });
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      t.after(async () => {
        const entries = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket }),
        );
        if (entries.Contents?.length)
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: entries.Contents.map(({ Key }) => ({ Key })) },
            }),
          );
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
        s3.destroy();
      });
    } else {
      const storage = app.get(AttachmentStorage);
      storage.upload = async (key) => `https://objects.example.test/${key}`;
      storage.readStaging = async (key) =>
        uploads.get(key) ?? Buffer.from('missing');
      storage.seal = async (key, bytes) => {
        uploads.set(key, bytes);
      };
      storage.discard = async (key) => {
        uploads.delete(key);
      };
      storage.download = async (key) => `https://objects.example.test/${key}`;
    }
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    async function request(path, actor, method = 'GET', body, expected = 200) {
      const response = await fetch(`${origin}/v1/${path}`, {
        method,
        redirect: 'error',
        headers: {
          ...(actor && { Authorization: `Bearer ${actor.accessToken}` }),
          ...(body && { 'Content-Type': 'application/json' }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      const value = response.status === 204 ? null : await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(value)}`,
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return value;
    }
    async function register(displayName) {
      return request(
        'auth/register',
        null,
        'POST',
        {
          displayName,
          email: `${displayName.toLowerCase()}@example.test`,
          password: randomBytes(24).toString('base64url'),
        },
        201,
      );
    }
    const [ada, ben, chi, dev] = await Promise.all(
      ['Ada', 'Ben', 'Chi', 'Dev'].map(register),
    );
    const user = (actor) => actor.user.id;
    const base = (id) => `conversations/${id}`;
    const send = (
      id,
      actor,
      body,
      clientMessageId = randomUUID(),
      attachmentIds = [],
      status = 200,
    ) =>
      request(
        `${base(id)}/messages`,
        actor,
        'POST',
        { body, clientMessageId, attachmentIds },
        status,
      );

    await t.test(
      'outbox survives committed upload and message responses being dropped',
      { skip: !endpoint },
      async () => {
        const { OfflineStore } = require('../../mobile/src/offline/store.ts');
        const { OutboxWorker } = require('../../mobile/src/offline/worker.ts');
        const { openDatabase } = require('../../mobile/test/sqlite-worker.cjs');
        const { migrate } = require('../../mobile/src/sqlite-core.ts');
        const { reconciliationPageSchema } = require('@chatapp/contracts');
        const { mkdtemp, rm } = require('node:fs/promises');
        const { tmpdir } = require('node:os');
        const folder = await mkdtemp(join(tmpdir(), 'chatapp-api-offline-'));
        const path = join(folder, 'account.db');
        const chat = await request('conversations/direct', ada, 'POST', {
          userId: user(dev),
        });
        const root = base(chat.id);
        const bytes = Buffer.from('Preserved through both failures');
        const staged = {
          id: randomUUID(),
          input: {
            fileName: 'recovery.txt',
            mimeType: 'text/plain',
            size: bytes.length,
          },
        };
        const operation = randomUUID();
        const openStore = async () => {
          const sqlite = openDatabase(path);
          await migrate(sqlite, true);
          return new OfflineStore(sqlite, user(ada));
        };
        let store = await openStore();
        let now = Date.now();
        let uploaded = 0;
        let posted = 0;
        let firstRequest;
        const verify = async (id) =>
          reconciliationPageSchema.parse(
            await request(`${base(id)}/messages?reconcile=1`, ada),
          );
        const recoverUpload = async (id, fileId, input) =>
          request(
            `${base(id)}/attachments/recover/${fileId}`,
            ada,
            'POST',
            input,
          );
        const worker = () =>
          new OutboxWorker(store, {
            verify,
            recoverUpload,
            uuid: randomUUID,
            eligible: () => true,
            now: () => now,
            random: () => 0,
            async upload(grant) {
              const res = await fetch(grant.url, {
                method: 'PUT',
                headers: grant.headers,
                body: bytes,
              });
              assert.equal(res.status, 200);
              uploaded++;
              throw new TypeError('PUT response lost after storage commit');
            },
            complete: (id, a) =>
              request(`${base(id)}/attachments/${a}/complete`, ada, 'POST'),
            async send(id, input) {
              firstRequest = input;
              posted++;
              await request(`${base(id)}/messages`, ada, 'POST', input);
              throw new TypeError('message response lost after Mongo commit');
            },
          });
        try {
          await store.cacheConversations([chat]);
          await store.saveDraft(
            chat.id,
            { body: 'Preserved message', file: staged },
            now,
          );
          await store.enqueue(chat.id, operation, ada.user, now);
          const [grant, replay] = await Promise.all([
            recoverUpload(chat.id, staged.id, staged.input),
            recoverUpload(chat.id, staged.id, staged.input),
          ]);
          assert.equal(grant.attachment.id, replay.attachment.id);
          await request(
            `${root}/attachments/recover/${staged.id}`,
            ada,
            'POST',
            { ...staged.input, size: bytes.length + 1 },
            409,
          );
          await request(
            `${root}/attachments/recover/${staged.id}`,
            chi,
            'POST',
            staged.input,
            404,
          );
          await worker().processNext();
          assert.equal(
            (await store.thread(chat.id)).rows[0].state,
            'RETRY_WAIT',
          );
          await store.db.close();
          store = await openStore();
          now += 5000;
          await worker().processNext();
          assert.equal(
            (await store.thread(chat.id)).rows[0].state,
            'RETRY_WAIT',
          );
          await store.db.close();
          store = await openStore();
          now += 5000;
          await worker().processNext();
          assert.equal(uploaded, 1);
          assert.equal(posted, 1);
          const rows = (await store.thread(chat.id)).rows;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].state, 'CONFIRMED');
          assert.equal(rows[0].message.attachments[0].id, grant.attachment.id);
          assert.equal(firstRequest.clientMessageId, operation);
          const repeated = await request(
            `${root}/messages`,
            ada,
            'POST',
            firstRequest,
          );
          assert.equal(rows[0].message.id, repeated.id);
          assert.equal(
            await db.message.count({
              where: { senderId: user(ada), clientMessageId: operation },
            }),
            1,
          );
          const peerHistory = await request(
            `${root}/messages?reconcile=1`,
            dev,
          );
          assert.equal(peerHistory.items[0].clientMessageId, undefined);
          await request(
            `${root}/messages/${repeated.id}`,
            ada,
            'DELETE',
            undefined,
            204,
          );
          const tombstone = (await verify(chat.id)).items[0];
          assert.equal(tombstone.body, '');
          assert.equal(tombstone.deleted, true);
          assert.equal(tombstone.clientMessageId, operation);
        } finally {
          await store.db.close().catch(() => undefined);
          await rm(folder, { recursive: true, force: true });
          // Remove the extra direct thread before baseline assertions count all direct conversations.
          await db.message.deleteMany({ where: { conversationId: chat.id } });
          await db.attachment.deleteMany({
            where: { conversationId: chat.id },
          });
          await db.membership.deleteMany({
            where: { conversationId: chat.id },
          });
          await db.conversation.delete({ where: { id: chat.id } });
        }
      },
    );

    const discovery = peopleSchema.parse(
      await request('users/discover?q=be', ada),
    );
    assert.deepEqual(
      discovery.map((person) => person.id),
      [user(ben)],
    );
    assert.deepEqual(await request('users/discover?q=ada', ada), []);
    await request('users/discover?q=be', null, 'GET', undefined, 401);
    await request('conversations', null, 'GET', undefined, 401);
    await request(
      'conversations/group',
      ada,
      'POST',
      { title: 'x'.repeat(26000) },
      413,
    );
    await request('users/discover?q=b', ada, 'GET', undefined, 400);
    for (let i = 0; i < 28; i++) await request('users/discover?q=be', ada);
    await request('users/discover?q=be', ada, 'GET', undefined, 429);
    await request(
      'conversations/direct',
      ada,
      'POST',
      { userId: user(ada) },
      400,
    );

    const [direct, reverse] = (
      await Promise.all([
        request('conversations/direct', ada, 'POST', { userId: user(ben) }),
        request('conversations/direct', ben, 'POST', { userId: user(ada) }),
      ])
    ).map((row) => conversationSchema.parse(row));
    assert.equal(direct.id, reverse.id);
    assert.equal(await db.conversation.count({ where: { kind: 'DIRECT' } }), 1);
    assert.deepEqual(
      (await db.conversation.findUniqueOrThrow({ where: { id: direct.id } }))
        .directUsers,
      [user(ada), user(ben)].sort(),
    );
    await request(base(direct.id), chi, 'GET', undefined, 404);
    await request(
      'conversations/group',
      ada,
      'POST',
      {
        clientGroupId: randomUUID(),
        title: 'Invalid',
        userIds: ['000000000000000000000000'],
      },
      404,
    );
    const input = {
      clientGroupId: randomUUID(),
      title: 'Field notes',
      userIds: [user(ben), user(chi)],
    };
    const [group, duplicateGroup] = await Promise.all([
      request('conversations/group', ada, 'POST', input),
      request('conversations/group', ada, 'POST', input),
    ]);
    const id = group.id;
    assert.equal(duplicateGroup.id, id);
    assert.equal(await db.conversation.count({ where: { kind: 'GROUP' } }), 1);
    assert.equal(
      await db.membership.count({ where: { conversationId: id } }),
      3,
    );
    await request(
      'conversations/group',
      ada,
      'POST',
      { ...input, title: 'Different' },
      409,
    );
    await request(`${base(id)}/messages`, dev, 'GET', undefined, 404);
    await request(`${base(id)}/members`, dev, 'GET', undefined, 404);
    await request(
      `${base(id)}/members/${user(dev)}`,
      ben,
      'PATCH',
      { role: 'MEMBER' },
      403,
    );
    await request(
      `${base(id)}/members/${user(ada)}`,
      ada,
      'PATCH',
      { role: 'MEMBER' },
      403,
    );
    await request(
      `${base(id)}/members/${user(ada)}`,
      ada,
      'DELETE',
      undefined,
      403,
    );
    await request(`${base(id)}/members/${user(ben)}`, ada, 'PATCH', {
      role: 'ADMIN',
    });
    await request(
      `${base(id)}/members/${user(chi)}`,
      ben,
      'PATCH',
      { role: 'ADMIN' },
      403,
    );
    const initial = await send(id, ada, 'calibration before invite');
    await request(`${base(id)}/members/${user(dev)}`, ben, 'PATCH', {
      role: 'MEMBER',
    });
    assert.deepEqual((await request(`${base(id)}/messages`, dev)).items, []);
    assert.deepEqual(
      (await request(`${base(id)}/search?q=calibration`, dev)).items,
      [],
    );
    await request(`${base(id)}/members/${user(chi)}`, ben, 'DELETE');
    await request(`${base(id)}/messages`, chi, 'GET', undefined, 404);
    await request(`${base(id)}/members/${user(chi)}`, ben, 'PATCH', {
      role: 'MEMBER',
    });
    assert.deepEqual((await request(`${base(id)}/messages`, chi)).items, []);

    const operationId = randomUUID();
    const [first, repeat] = (
      await Promise.all([
        send(id, ada, 'calibration after invite', operationId),
        send(id, ada, 'calibration after invite', operationId),
      ])
    ).map((row) => messageSchema.parse(row));
    assert.equal(first.id, repeat.id);
    assert.equal(
      await db.message.count({
        where: { senderId: user(ada), clientMessageId: operationId },
      }),
      1,
    );
    assert.equal(
      (await send(id, ada, 'calibration after invite', operationId)).id,
      first.id,
    );
    await send(id, ada, 'changed', operationId, [], 409);
    await send(
      direct.id,
      ada,
      'calibration after invite',
      operationId,
      [],
      409,
    );
    await send(direct.id, ada, 'calibration private');
    assert.deepEqual(
      (await request(`${base(id)}/search?q=calibration`, chi)).items.map(
        (row) => row.id,
      ),
      [first.id],
    );
    await request(
      `${base(id)}/messages/${first.id}`,
      ben,
      'DELETE',
      undefined,
      403,
    );
    await request(
      `${base(id)}/messages/${first.id}`,
      ada,
      'DELETE',
      undefined,
      204,
    );
    await request(
      `${base(id)}/messages/${first.id}`,
      ada,
      'DELETE',
      undefined,
      204,
    );
    const tombstone = await send(
      id,
      ada,
      'calibration after invite',
      operationId,
    );
    assert.equal(tombstone.body, '');
    assert.equal(tombstone.deleted, true);
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: first.id } })).body,
      null,
    );
    assert.deepEqual(
      (await request(`${base(id)}/search?q=calibration`, ada)).items.map(
        (row) => row.id,
      ),
      [initial.id],
    );

    for (let i = 0; i < 28; i++)
      await send(id, ben, `pagination page item ${i}`);
    await db.message.updateMany({
      where: { conversationId: id },
      data: { createdAt: new Date('2026-01-01') },
    });
    const serverRows = await db.message.findMany({
      where: { conversationId: id, deletedAt: null },
      orderBy: { id: 'desc' },
    });
    for (const [path, search] of [
      ['messages?limit=7', false],
      ['search?q=pagination&limit=7', true],
    ]) {
      const all = [];
      let cursor;
      do {
        const page = (search ? searchPageSchema : messagePageSchema).parse(
          await request(
            `${base(id)}/${path}${cursor ? `&cursor=${cursor}` : ''}`,
            ada,
          ),
        );
        all.push(...page.items.map((row) => row.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(
        all,
        serverRows
          .filter((row) => !search || row.body.startsWith('pagination'))
          .map((row) => row.id),
      );
    }
    await request(
      `${base(id)}/messages?cursor=invalid`,
      ada,
      'GET',
      undefined,
      400,
    );

    const text = Buffer.from('Field notes from the lab');
    const grant = await request(
      `${base(id)}/attachments`,
      ada,
      'POST',
      {
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        size: text.length,
      },
      201,
    );
    const aId = grant.attachment.id;
    const completion = `${base(id)}/attachments/${aId}/complete`;
    const download = `${base(id)}/attachments/${aId}/download`;
    await request(completion, ada, 'POST', undefined, 400);
    await request(completion, ben, 'POST', undefined, 404);
    await request(download, ben, 'POST', undefined, 404);
    if (endpoint) {
      const bad = await fetch(grant.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: text,
      });
      assert.equal(bad.status, 403);
      const wrongLength = await fetch(grant.url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': String(text.length - 1),
        },
        body: text.subarray(1),
      });
      assert.equal(wrongLength.status, 403);
      const uploaded = await fetch(grant.url, {
        method: 'PUT',
        headers: grant.headers,
        body: text,
      });
      assert.equal(uploaded.status, 200, await uploaded.text());
    } else uploads.set(new URL(grant.url).pathname.slice(1), text);
    assert.equal((await request(completion, ada, 'POST')).id, aId);
    if (endpoint) {
      const overwritten = await fetch(grant.url, {
        method: 'PUT',
        headers: grant.headers,
        body: Buffer.alloc(text.length, 'x'),
      });
      assert.equal(overwritten.status, 200, await overwritten.text());
    }
    await send(id, ben, '', randomUUID(), [aId], 404);
    await send(direct.id, ada, '', randomUUID(), [aId], 404);
    const file = await send(id, ada, '', randomUUID(), [aId]);
    assert.equal(file.attachments[0].id, aId);
    const readerGrant = await request(download, chi, 'POST');
    if (endpoint) {
      const reader = await fetch(readerGrant.url);
      assert.deepEqual(Buffer.from(await reader.arrayBuffer()), text);
      const anonymous = await fetch(readerGrant.url.split('?')[0]);
      assert.equal(anonymous.status, 403);
    } else
      assert.deepEqual(
        uploads.get(new URL(readerGrant.url).pathname.slice(1)),
        text,
      );
    await request(`${base(id)}/members/${user(chi)}`, ada, 'DELETE');
    await request(download, chi, 'POST', undefined, 404);
    await request(`${base(id)}/members/${user(chi)}`, ada, 'PATCH', {
      role: 'MEMBER',
    });
    await request(download, chi, 'POST', undefined, 404);
    await request(
      `${base(id)}/messages/${file.id}`,
      ada,
      'DELETE',
      undefined,
      204,
    );
    await request(download, ada, 'POST', undefined, 404);
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: file.id } }))
        .attachmentIds.length,
      0,
    );
  },
);

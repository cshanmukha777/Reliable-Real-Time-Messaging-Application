const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { createApplication } = require('../dist/application.js');
const { loadEnvironment } = require('../dist/config/environment.js');
const { EventRelay } = require('../dist/realtime/relay.js');
const { RealtimeGateway } = require('../dist/realtime/gateway.js');
const { allowUpgrade } = require('../dist/realtime/socket-adapter.js');
const { RealtimeClient } = require('../../mobile/src/realtime/client.ts');
const { MessagingApi } = require('../../mobile/src/messaging/api.ts');
const { OfflineStore } = require('../../mobile/src/offline/store.ts');
const {
  RealtimeProjection,
} = require('../../mobile/src/realtime/projection.ts');
const { ReplayEngine } = require('../../mobile/src/realtime/replay.ts');
const { openDatabase } = require('../../mobile/test/sqlite-worker.cjs');
const { migrate } = require('../../mobile/src/sqlite-core.ts');

function waitFor(socket, signal, match = () => true, deadline = 9000) {
  return new Promise((resolve, reject) => {
    const callback = (value) => {
      if (!match(value)) return;
      finish();
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Timed out waiting for ' + signal));
    }, deadline);
    function finish() {
      clearTimeout(timer);
      socket.off(signal, callback);
    }
    socket.on(signal, callback);
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  'authenticated Socket.IO, live SQLite projection, receipt progression and durable replay',
  { timeout: 90000 },
  async (t) => {
    const raw = process.env.CHATAPP_TEST_DATABASE_URL ?? '';
    assert.match(raw, /^mongodb:\/\/127\.0\.0\.1:\d+\/chatapp_test\?/);
    const database = new URL(raw);
    assert.equal(database.searchParams.get('directConnection'), 'true');
    assert.ok(database.searchParams.get('replicaSet'));
    database.pathname = '/chatapp_test_rt_' + randomBytes(8).toString('hex');
    const signingKey = randomBytes(32);
    const environment = loadEnvironment({
      DATABASE_URL: database.href,
      AUTH_SIGNING_KEY: signingKey.toString('hex'),
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:8080',
    });
    const db = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
    const config = {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: environment.DATABASE_URL },
      encoding: 'utf8',
    };
    const schema = spawnSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
      ],
      config,
    );
    assert.equal(schema.status, 0, schema.stderr);
    const app = await createApplication(environment);
    const sockets = new Set();
    const storage = await mkdtemp(join(tmpdir(), 'chatapp-realtime-'));
    t.after(async () => {
      for (const socket of sockets) socket.disconnect();
      await app.close();
      await db.$runCommandRaw({ dropDatabase: 1 });
      await db.$disconnect();
      await rm(storage, { force: true, recursive: true });
    });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const relay = app.get(EventRelay);
    async function request(path, actor, method = 'GET', body, status = 200) {
      const response = await fetch(origin + '/v1/' + path, {
        method,
        headers: {
          ...(actor && { Authorization: 'Bearer ' + actor.accessToken }),
          ...(body && { 'Content-Type': 'application/json' }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      const payload = response.status === 204 ? null : await response.json();
      assert.equal(
        response.status,
        status,
        method + ' ' + path + ': ' + JSON.stringify(payload),
      );
      return payload;
    }
    const credentials = (name) => ({
      displayName: name,
      email: name.toLowerCase() + '@example.test',
      password: randomBytes(24).toString('base64url'),
    });
    const aCred = credentials('Ada'),
      bCred = credentials('Ben'),
      cCred = credentials('Chi'),
      dCred = credentials('Dev');
    const [ada, ben, chi, dev] = await Promise.all(
      [aCred, bCred, cCred, dCred].map((input) =>
        request('auth/register', null, 'POST', input, 201),
      ),
    );
    const base = (id) => 'conversations/' + id;
    const user = (actor) => actor.user.id;
    const socket = (token, override = {}) => {
      const client = io(origin, {
        path: '/realtime',
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false,
        forceNew: true,
        timeout: 5000,
        ...(token && { auth: { token } }),
        ...override,
      });
      sockets.add(client);
      return client;
    };
    async function connect(actor) {
      const client = socket(actor.accessToken);
      const waiting = waitFor(client, 'connect');
      client.connect();
      await waiting;
      return client;
    }
    async function rejected(client) {
      const waiting = waitFor(client, 'connect_error');
      client.connect();
      await waiting;
      assert.equal(client.connected, false);
      client.disconnect();
    }
    const watch = (client, id, after = 0) =>
      client.timeout(5000).emitWithAck('watch', { id, after });
    const send = (
      actor,
      id,
      body,
      operation = randomUUID(),
      attachmentIds = [],
      status = 200,
    ) =>
      request(
        base(id) + '/messages',
        actor,
        'POST',
        { body, clientMessageId: operation, attachmentIds },
        status,
      );
    const list = (actor, id, after = 0) =>
      request(base(id) + '/events?after=' + after, actor);
    const account = (actor, after = 0) =>
      request('sync/account?after=' + after, actor);
    const afterAccount = (client, watermark) =>
      waitFor(
        client,
        'available',
        (event) => event.stream === 'ACCOUNT' && event.highWater > watermark,
      );

    await t.test(
      'production realtime trusts TLS and an explicit browser origin',
      () => {
        const production = {
          NODE_ENV: 'production',
          CORS_ORIGINS: ['https://app.example.test'],
        };
        const forwarded = {
          host: 'api.example.test',
          'x-forwarded-proto': 'https',
        };
        const allowed = (headers, peer, encrypted = false) =>
          allowUpgrade(production, {
            headers,
            socket: { remoteAddress: peer, encrypted },
          });
        assert.equal(allowed(forwarded, '203.0.113.5'), false);
        assert.equal(allowed(forwarded, '127.0.0.1'), true);
        assert.equal(
          allowed({ origin: 'https://app.example.test' }, '203.0.113.5', true),
          true,
        );
        assert.equal(
          allowed(
            { origin: 'https://other.example.test' },
            '203.0.113.5',
            true,
          ),
          false,
        );
        assert.equal(
          allowed(
            { ...forwarded, origin: 'http://api.example.test' },
            '127.0.0.1',
          ),
          false,
        );
      },
    );

    await t.test('signed session and origin gates', async () => {
      const claims = jwt.decode(ada.accessToken);
      const expired = jwt.sign(
        { ...claims, iat: claims.iat - 120, exp: claims.iat - 1 },
        signingKey,
      );
      const forged = jwt.sign(claims, randomBytes(32));
      await Promise.all([
        rejected(socket()),
        rejected(socket('malformed')),
        rejected(socket(forged)),
        rejected(socket(expired)),
        rejected(
          socket(ada.accessToken, {
            extraHeaders: { Origin: 'https://untrusted.example.test' },
          }),
        ),
        rejected(socket(undefined, { query: { token: ada.accessToken } })),
      ]);
      const fromNative = socket(ada.accessToken, {
        extraHeaders: { Origin: origin },
      });
      const establishing = waitFor(fromNative, 'connect');
      fromNative.connect();
      await establishing;
      fromNative.disconnect();
      const client = await connect(ada);
      const logout = waitFor(client, 'disconnect');
      await request(
        'auth/logout',
        null,
        'POST',
        { refreshToken: ada.refreshToken },
        204,
      );
      await logout;
      await rejected(socket(ada.accessToken));
      const refreshed = await request('auth/login', null, 'POST', {
        email: aCred.email,
        password: aCred.password,
      });
      Object.assign(ada, refreshed);
      const rotated = await request('auth/refresh', null, 'POST', {
        refreshToken: ada.refreshToken,
        operationId: randomBytes(32).toString('base64url'),
      });
      Object.assign(ada, rotated);
      const valid = await connect(ada);
      valid.disconnect();
      const disabled = await connect(dev);
      const disabledDisconnect = waitFor(disabled, 'disconnect');
      await db.user.update({
        where: { id: user(dev) },
        data: { status: 'DISABLED' },
      });
      await disabledDisconnect;
      await rejected(socket(dev.accessToken));
      await db.user.update({
        where: { id: user(dev) },
        data: { status: 'ACTIVE' },
      });
    });

    await t.test(
      'concurrent commands obey room, rate and packet limits',
      async () => {
        const groups = await Promise.all(
          Array.from({ length: 5 }, (_, index) =>
            request('conversations/group', ada, 'POST', {
              title: 'Limit test ' + index,
              userIds: [user(dev)],
              clientGroupId: randomUUID(),
            }),
          ),
        );
        const probe = await connect(ada);
        try {
          const acknowledgments = await Promise.all(
            groups.map(({ id }) => watch(probe, id)),
          );
          assert.equal(acknowledgments.filter((result) => result.ok).length, 4);
          const id = groups[0].id;
          const commands = await Promise.all(
            Array.from({ length: 64 }, () =>
              probe.timeout(5000).emitWithAck('typing', { id, active: false }),
            ),
          );
          assert.ok(commands.some((result) => !result.ok));
          assert.ok(commands.some((result) => result.ok));
          const closed = waitFor(probe, 'disconnect');
          probe.emit('typing', 'x'.repeat(10_000));
          await closed;
          assert.equal(probe.connected, false);
        } finally {
          probe.disconnect();
        }
      },
    );

    const chat = await request('conversations/group', ada, 'POST', {
      title: 'Live group',
      userIds: [user(ben), user(chi)],
      clientGroupId: randomUUID(),
    });
    const id = chat.id;
    const a = await connect(ada);
    const watchA = waitFor(a, 'presence', (p) => p.id === id);
    assert.equal((await watch(a, id)).ok, true);
    await watchA;
    const bFirstPresence = waitFor(a, 'presence', (p) =>
      p.online.includes(user(ben)),
    );
    let b = await connect(ben);
    await bFirstPresence;
    const b2 = await connect(ben);
    assert.equal((await watch(b, id)).ok, true);
    const outsider = await connect(dev);
    assert.equal((await watch(outsider, id)).ok, false);
    assert.equal(
      (await outsider.timeout(5000).emitWithAck('typing', { id, active: true }))
        .ok,
      false,
    );
    assert.equal(
      (await a.timeout(5000).emitWithAck('watch', { id: 'injected', after: 0 }))
        .ok,
      false,
    );
    const c = await connect(chi);
    assert.equal((await watch(c, id)).ok, true);

    await t.test('typing expiry and multi-device presence', async () => {
      const received = waitFor(
        a,
        'typing',
        (p) => p.userId === user(ben) && p.active === true,
      );
      const expired = waitFor(
        a,
        'typing',
        (p) => p.userId === user(ben) && p.active === false,
      );
      assert.equal(
        (await b.timeout(5000).emitWithAck('typing', { id, active: true })).ok,
        true,
      );
      await received;
      let extraStarts = 0;
      const count = (p) => {
        if (p.active && p.userId === user(ben)) extraStarts++;
      };
      a.on('typing', count);
      await b.timeout(5000).emitWithAck('typing', { id, active: true });
      await expired;
      a.off('typing', count);
      assert.equal(extraStarts, 0);
      const stillPresent = waitFor(a, 'presence', (p) =>
        p.online.includes(user(ben)),
      );
      b2.disconnect();
      await watch(a, id);
      await stillPresent;
      const offline = waitFor(
        a,
        'presence',
        (p) => !p.online.includes(user(ben)),
      );
      b.disconnect();
      await offline;
      b = await connect(ben);
      await watch(b, id);
    });

    const aStore = async (actor, path) => {
      const sq = openDatabase(path);
      await migrate(sq, true);
      const store = new OfflineStore(sq, user(actor));
      const projection = new RealtimeProjection(store);
      const paths = [];
      const api = new MessagingApi(
        { origin, authorized: (work) => work(actor.accessToken) },
        (url, config) => {
          paths.push(new URL(url).pathname);
          return fetch(url, config);
        },
      );
      return {
        store,
        projection,
        engine: new ReplayEngine(projection, api),
        api,
        paths,
      };
    };
    const livePath = join(storage, 'recipient.db');
    let local = await aStore(ben, livePath);
    const signal = new AbortController().signal;
    const current = () => true;
    const run = () => local.engine.run(signal, current);

    await t.test(
      'committed live hints drive replay and SQLite acknowledgments without history polls',
      async () => {
        local.engine.probe();
        await run();
        const operation = randomUUID();
        let notice = afterAccount(b, (await account(ben)).highWater);
        const message = await send(ada, id, 'first live message', operation);
        const hint = await notice;
        assert.deepEqual(Object.keys(hint).sort(), [
          'highWater',
          'stream',
          'streamId',
        ]);
        const originalSequence = (await list(ada, id)).highWater;
        assert.equal(
          (await send(ada, id, 'first live message', operation)).id,
          message.id,
        );
        assert.equal((await list(ada, id)).highWater, originalSequence);
        assert.equal(
          await db.receipt.count({
            where: { messageId: message.id, eligible: true },
          }),
          2,
        );
        assert.equal(
          await db.receipt.count({
            where: { messageId: message.id, deliveredAt: { not: null } },
          }),
          0,
        );
        local.engine.hint(hint);
        await run();
        assert.equal(
          (await local.store.thread(id)).rows.some(
            (row) => row.message.id === message.id,
          ),
          true,
        );
        const delivered = await db.receipt.findUnique({
          where: {
            messageId_recipientId: {
              messageId: message.id,
              recipientId: user(ben),
            },
          },
        });
        assert.ok(delivered.deliveredAt);
        assert.equal(delivered.readAt, null);
        assert.equal(
          await local.projection.read(id, [message.id], () => false),
          false,
        );
        assert.equal(
          await local.projection.read(id, [message.id], () => true),
          true,
        );
        await run();
        const read = await db.receipt.findUnique({
          where: {
            messageId_recipientId: {
              messageId: message.id,
              recipientId: user(ben),
            },
          },
        });
        assert.ok(read.readAt >= read.deliveredAt);
        const last = (await list(ada, id)).highWater;
        for (const stage of ['DELIVERED', 'READ', 'READ'])
          await request(
            base(id) + '/messages/' + message.id + '/receipt',
            ben,
            'POST',
            { stage },
            204,
          );
        assert.equal((await list(ada, id)).highWater, last);
        const own = (await list(ada, id)).events.find(
          (entry) => entry.message?.id === message.id,
        ).message;
        assert.deepEqual(own.receipt, { eligible: 2, delivered: 1, read: 1 });
        await request(
          base(id) + '/messages/' + message.id + '/receipt',
          ada,
          'POST',
          { stage: 'READ' },
          404,
        );
        assert.equal(
          local.paths.some((path) => path.endsWith('/messages')),
          false,
        );
        const stable = local.paths.length;
        await sleep(350);
        assert.equal(local.paths.length, stable);

        b.disconnect();
        await local.store.db.close();
        const missed = await send(ada, id, 'saved while disconnected');
        await request(
          base(id) + '/messages/' + message.id,
          ada,
          'DELETE',
          undefined,
          204,
        );
        const deletion = (await list(ada, id)).highWater;
        await request(
          base(id) + '/messages/' + message.id,
          ada,
          'DELETE',
          undefined,
          204,
        );
        assert.equal((await list(ada, id)).highWater, deletion);
        local = await aStore(ben, livePath);
        b = await connect(ben);
        await watch(b, id);
        local.engine.probe();
        await run();
        const rows = (await local.store.thread(id)).rows.map(
          ({ message }) => message,
        );
        assert.ok(rows.some((record) => record.id === missed.id));
        assert.ok(
          rows.some(
            (record) =>
              record.id === message.id && record.deleted && record.body === '',
          ),
        );
        notice = afterAccount(b, (await account(ben)).highWater);
        await request(base(id) + '/members/' + user(ben), ada, 'DELETE');
        const revoked = await notice;
        local.engine.hint(revoked);
        await run();
        assert.equal((await local.store.thread(id)).active, false);
        assert.deepEqual((await local.store.thread(id)).rows, []);
        assert.equal((await watch(b, id)).ok, false);
        await request(base(id) + '/events', ben, 'GET', undefined, 404);
        const inactive = await account(ben);
        assert.ok(
          inactive.events.some(
            (event) =>
              event.type === 'membership.revoked' && event.membership === null,
          ),
        );
        assert.equal(
          (
            await db.receipt.findUnique({
              where: {
                messageId_recipientId: {
                  messageId: missed.id,
                  recipientId: user(ben),
                },
              },
            })
          ).eligible,
          false,
        );

        await request(base(id) + '/members/' + user(ben), ada, 'PATCH', {
          role: 'MEMBER',
        });
        await request(base(id) + '/members/' + user(ben), ada, 'PATCH', {
          role: 'ADMIN',
        });
        assert.equal((await list(ben, id)).snapshotRequired, true);
        const snapshot = await request(base(id) + '/events/snapshot', ben);
        assert.equal(snapshot.conversation.role, 'ADMIN');
        assert.deepEqual(snapshot.messages, []);
        assert.equal(
          (await account(ben)).events.some(
            (event) => event.type === 'membership.granted',
          ),
          true,
        );
        await local.store.db.close();
      },
    );

    await t.test(
      'the shipped mobile connection manager bootstraps, resumes and tears down scope',
      async () => {
        const managed = await request('conversations/group', ada, 'POST', {
          title: 'Managed connection',
          userIds: [user(ben)],
          clientGroupId: randomUUID(),
        });
        const device = await aStore(ben, join(storage, 'managed-client.db'));
        let enabled = true;
        let generation = 1;
        let connects = 0;
        const session = {
          origin,
          accessGeneration: () => generation,
          socketAuthentication: async () => {
            connects++;
            return { token: ben.accessToken, generation };
          },
          refresh: async () => undefined,
        };
        const client = new RealtimeClient(
          session,
          device.api,
          device.projection,
          () => enabled,
          () => undefined,
        );
        async function until(condition) {
          for (let tick = 0; tick < 150; tick++) {
            if (await condition()) return;
            await sleep(40);
          }
          assert.fail(
            'The mobile realtime client did not reach the expected state',
          );
        }
        try {
          client.start();
          await until(() => client.status() === 'live');
          client.watch(managed.id);
          const sent = await send(
            ada,
            managed.id,
            'Live through the shipped mobile transport',
          );
          await until(async () =>
            Boolean(
              await device.store.db.first(
                'SELECT server_id FROM messages WHERE server_id=?',
                sent.id,
              ),
            ),
          );
          generation++;
          client.tokenChanged();
          await until(() => connects === 2 && client.status() === 'live');
          assert.equal(
            device.paths.some((path) => path.endsWith('/messages')),
            false,
          );
          enabled = false;
          await client.close();
          assert.equal(client.status(), 'offline');
          const seen = device.paths.length;
          await send(ada, managed.id, 'Write after this account scope closed');
          await sleep(650);
          assert.equal(device.paths.length, seen);
        } finally {
          await client.close();
          await device.store.db.close();
        }
      },
    );

    await t.test(
      'atomic event writes, unique independent cursors and bounded retention',
      async () => {
        const [direct, reciprocal] = await Promise.all([
          request('conversations/direct', ada, 'POST', { userId: user(dev) }),
          request('conversations/direct', dev, 'POST', { userId: user(ada) }),
        ]);
        assert.equal(direct.id, reciprocal.id);
        const directId = direct.id;
        const initial = (await list(ada, directId)).highWater;
        assert.equal(initial, 1);
        const concurrent = await Promise.all([
          send(ada, directId, 'first concurrent'),
          send(dev, directId, 'second concurrent'),
        ]);
        assert.notEqual(concurrent[0].id, concurrent[1].id);
        assert.deepEqual(
          (await list(ada, directId)).events.map((event) => event.sequence),
          [1, 2, 3],
        );
        const row = await db.realtimeEvent.findFirstOrThrow({
          where: { stream: 'CONVERSATION', streamId: directId, sequence: 1 },
        });
        const { id: ignored, ...copy } = row;
        assert.ok(ignored);
        await assert.rejects(
          db.realtimeEvent.create({ data: copy }),
          (err) => err.code === 'P2002',
        );
        await send(
          ada,
          directId,
          'unattached payload must roll back',
          randomUUID(),
          ['000000000000000000000001'],
          404,
        );
        assert.equal((await list(ada, directId)).highWater, 3);
        assert.equal(
          await db.message.count({ where: { conversationId: directId } }),
          2,
        );
        await db.conversation.update({
          where: { id: directId },
          data: { eventSequence: 1000 },
        });
        await db.realtimeEvent.createMany({
          data: Array.from({ length: 997 }, (_, i) => ({
            ...copy,
            sequence: i + 4,
          })),
        });
        await send(ada, directId, 'retention boundary');
        const expired = await list(ada, directId);
        assert.equal(expired.snapshotRequired, true);
        assert.equal(expired.highWater, 1001);
        const retained = await list(ada, directId, 1);
        assert.equal(retained.events[0].sequence, 2);
        assert.equal(
          await db.realtimeEvent.count({
            where: { stream: 'CONVERSATION', streamId: directId },
          }),
          1000,
        );
      },
    );

    await t.test(
      'claim expiry, duplicate dispatch after publication and stale checkpoint fencing',
      async () => {
        const relayed = await request('conversations/group', ada, 'POST', {
          title: 'Lease recovery',
          userIds: [user(ben), user(chi)],
          clientGroupId: randomUUID(),
        });
        await relay.onModuleDestroy();
        const now = Date.now();
        await db.realtimeEvent.updateMany({
          where: { publishedAt: null },
          data: { publishedAt: new Date(now) },
        });
        const message = await send(ada, relayed.id, 'sent before relay crash');
        const when = new Date(Date.now() + 1000);
        const winners = await Promise.all([
          relay.claim(when),
          relay.claim(when),
        ]);
        const claims = winners
          .flat()
          .filter((event) => event.messageId === message.id);
        assert.equal(new Set(claims.map((row) => row.id)).size, claims.length);
        assert.equal(claims.length, 4);
        const first = claims.find(
          (event) => event.stream === 'ACCOUNT' && event.streamId === user(ben),
        );
        const gateway = app.get(RealtimeGateway);
        const one = waitFor(
          b,
          'available',
          (event) =>
            event.stream === 'ACCOUNT' && event.highWater === first.sequence,
        );
        await gateway.publish(first);
        await one;
        const again = await relay.claim(new Date(when.getTime() + 31000));
        const recovered = again.find((x) => x.id === first.id);
        assert.equal(recovered.attempts, 2);
        assert.notEqual(recovered.lease, first.lease);
        assert.equal(await relay.checkpoint(first), false);
        const duplicate = waitFor(
          b,
          'available',
          (event) =>
            event.stream === 'ACCOUNT' && event.highWater === first.sequence,
        );
        await gateway.publish(recovered);
        await duplicate;
        assert.equal(await relay.checkpoint(recovered), true);
        assert.equal(await db.message.count({ where: { id: message.id } }), 1);
      },
    );

    const secondSession = await request('auth/login', null, 'POST', {
      email: bCred.email,
      password: bCred.password,
    });
    const secondSocket = await connect(secondSession);
    const disconnected = [
      waitFor(b, 'disconnect'),
      waitFor(secondSocket, 'disconnect'),
    ];
    await request('auth/logout-all', ben, 'POST', undefined, 204);
    await Promise.all(disconnected);
  },
);

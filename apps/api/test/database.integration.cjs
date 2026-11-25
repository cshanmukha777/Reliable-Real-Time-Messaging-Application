const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createConnection, createServer } = require('node:net');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { healthResponseSchema } = require('@chatapp/contracts');
const { createApplication } = require('../dist/application.js');
const { loadEnvironment } = require('../dist/config/environment.js');

async function startNetworkSwitch(destinationPort) {
  const sockets = new Set();
  let available = true;
  const server = createServer((incoming) => {
    if (!available) {
      incoming.destroy();
      return;
    }
    const upstream = createConnection({
      host: '127.0.0.1',
      port: destinationPort,
    });
    sockets.add(incoming);
    sockets.add(upstream);
    for (const [socket, peer] of [
      [incoming, upstream],
      [upstream, incoming],
    ]) {
      socket.on('error', () => socket.destroy());
      socket.on('close', () => {
        sockets.delete(socket);
        peer.destroy();
      });
    }
    incoming.pipe(upstream).pipe(incoming);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  function setAvailable(enabled) {
    available = enabled;
    if (!available) for (const socket of sockets) socket.destroy();
  }
  return {
    port: server.address().port,
    setAvailable,
    async close() {
      setAvailable(false);
      const closed = once(server, 'close');
      server.close();
      await closed;
    },
  };
}

async function waitForReadiness(origin) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(origin + '/v1/health/ready');
    const health = healthResponseSchema.parse(await response.json());
    if (response.status === 200 && health.database === 'available') return;
    await delay(300);
  }
  assert.fail('API did not regain database readiness.');
}

test(
  'real MongoDB replica set with isolated schema and outage recovery',
  { timeout: 90000 },
  async (t) => {
    const raw = process.env.CHATAPP_TEST_DATABASE_URL ?? '';
    assert.match(
      raw,
      /^mongodb:\/\/127\.0\.0\.1:\d+\/chatapp_test\?/,
      'Use the dedicated local chatapp_test replica set URI.',
    );
    const url = new URL(raw);
    assert.equal(url.searchParams.get('directConnection'), 'true');
    assert.ok(url.searchParams.get('replicaSet'));
    url.pathname = `/chatapp_test_${randomBytes(8).toString('hex')}`;
    const environment = loadEnvironment({
      DATABASE_URL: url.href,
      NODE_ENV: 'test',
    });
    const prisma = new PrismaClient({
      datasourceUrl: environment.DATABASE_URL,
    });
    t.after(async () => {
      try {
        await prisma.$runCommandRaw({ dropDatabase: 1 });
      } finally {
        await prisma.$disconnect();
      }
    });
    const applied = spawnSync(
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
    assert.equal(applied.status, 0, applied.stderr);

    await t.test(
      'connects to an elected primary and writes and reads a record',
      async () => {
        await prisma.$connect();
        const hello = await prisma.$runCommandRaw({ hello: 1 });
        assert.equal(hello.setName, url.searchParams.get('replicaSet'));
        assert.equal(hello.isWritablePrimary, true);
        const created = await prisma.foundationProbe.create({
          data: { key: 'round-trip', value: 'saved' },
        });
        assert.deepEqual(
          await prisma.foundationProbe.findUnique({
            where: { key: created.key },
          }),
          created,
        );
      },
    );

    await t.test('commits a multi-record transaction', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.foundationProbe.create({
          data: { key: 'commit-a', value: 'a' },
        });
        await tx.foundationProbe.create({
          data: { key: 'commit-b', value: 'b' },
        });
      });
      assert.equal(
        await prisma.foundationProbe.count({
          where: { key: { startsWith: 'commit-' } },
        }),
        2,
      );
    });

    await t.test(
      'rolls back when a committed unique key rejects the second write',
      async () => {
        await assert.rejects(
          prisma.$transaction(async (tx) => {
            await tx.foundationProbe.create({
              data: { key: 'rollback-first', value: 'a' },
            });
            await tx.foundationProbe.create({
              data: { key: 'round-trip', value: 'duplicate' },
            });
          }),
          { code: 'P2002' },
        );
        assert.equal(
          await prisma.foundationProbe.findUnique({
            where: { key: 'rollback-first' },
          }),
          null,
        );
      },
    );

    await t.test(
      'enforces the unique index under concurrent duplicate creates',
      async () => {
        await assert.rejects(
          prisma.foundationProbe.create({
            data: { key: 'round-trip', value: 'duplicate' },
          }),
          { code: 'P2002' },
        );
        const attempts = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            prisma.foundationProbe.create({
              data: { key: 'concurrent', value: 'same' },
            }),
          ),
        );
        const accepted = attempts.filter(
          (result) => result.status === 'fulfilled',
        );
        assert.equal(accepted.length, 1);
        for (const result of attempts) {
          if (result.status === 'rejected')
            assert.equal(result.reason.code, 'P2002');
        }
        const canonical = await prisma.foundationProbe.findMany({
          where: { key: 'concurrent' },
        });
        assert.deepEqual(canonical, [accepted[0].value]);
      },
    );

    await t.test(
      'returns readiness outage and recovery while HTTP liveness remains up',
      async (outage) => {
        const network = await startNetworkSwitch(Number(url.port));
        outage.after(() => network.close());
        const proxiedUrl = new URL(url);
        proxiedUrl.port = String(network.port);
        const app = await createApplication(
          loadEnvironment({ DATABASE_URL: proxiedUrl.href, NODE_ENV: 'test' }),
        );
        outage.after(() => app.close());
        await app.listen(0, '127.0.0.1');
        const origin = await app.getUrl();
        await waitForReadiness(origin);

        network.setAvailable(false);
        const readiness = fetch(origin + '/v1/health/ready');
        assert.equal((await fetch(origin + '/v1/health/live')).status, 200);
        const failed = await readiness;
        assert.equal(failed.status, 503);
        assert.equal(
          healthResponseSchema.parse(await failed.json()).database,
          'unavailable',
        );

        network.setAvailable(true);
        await waitForReadiness(origin);
        assert.equal((await fetch(origin + '/v1/health/live')).status, 200);
      },
    );
  },
);

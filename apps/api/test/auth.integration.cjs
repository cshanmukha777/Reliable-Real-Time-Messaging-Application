const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { verify } = require('@node-rs/argon2');
const { PrismaClient } = require('@prisma/client');
const {
  accountSchema,
  errorResponseSchema,
  sessionResponseSchema,
} = require('@chatapp/contracts');
const { createApplication } = require('../dist/application.js');
const { loadEnvironment } = require('../dist/config/environment.js');
const { createHash } = require('node:crypto');
const { SessionManager } = require('../../mobile/src/auth/session-manager.ts');
const {
  credentialStorage,
} = require('../../mobile/src/auth/credential-storage.ts');

const random = () => randomBytes(32).toString('base64url');
const sha = (value) => createHash('sha256').update(value).digest('hex');

test(
  'authentication and two isolated accounts over real HTTP and MongoDB',
  { timeout: 90000 },
  async (t) => {
    const raw = process.env.CHATAPP_TEST_DATABASE_URL ?? '';
    assert.match(raw, /^mongodb:\/\/127\.0\.0\.1:\d+\/chatapp_test\?/);
    const url = new URL(raw);
    assert.equal(url.searchParams.get('directConnection'), 'true');
    assert.ok(url.searchParams.get('replicaSet'));
    url.pathname = `/chatapp_test_auth_${randomBytes(8).toString('hex')}`;
    const signingKey = randomBytes(32);
    const environment = loadEnvironment({
      DATABASE_URL: url.href,
      AUTH_SIGNING_KEY: signingKey.toString('hex'),
      NODE_ENV: 'test',
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
    const app = await createApplication(environment);
    t.after(() => app.close());
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();

    async function request(
      path,
      { method = 'GET', body, token, expected } = {},
    ) {
      const response = await fetch(origin + '/v1/' + path, {
        method,
        redirect: 'error',
        headers: {
          ...(body && { 'Content-Type': 'application/json' }),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      if (expected !== undefined) assert.equal(response.status, expected, path);
      const payload = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const error = errorResponseSchema.parse(payload);
        assert.equal(error.statusCode, response.status);
        if (expected === undefined)
          throw Object.assign(new Error(error.code), {
            status: response.status,
          });
      }
      return { response, payload };
    }
    const post = (path, body, expected) =>
      request(path, { method: 'POST', body, expected });
    const registration = (displayName, email) => ({
      displayName,
      email,
      password: random(),
    });
    const profile = (input, token, expected) =>
      request('users/me', { method: 'PATCH', token, body: input, expected });

    const a = registration('Ada Example', '  ADA@example.test  ');
    const b = registration('Ben Example', 'ben@example.test');
    let aInitial;
    let bInitial;
    await t.test(
      'validation, normalized unique email, Argon2id and atomic user/profile/session',
      async () => {
        await post('auth/register', { ...a, password: 'short' }, 400);
        await post('auth/register', { ...a, email: 'invalid' }, 400);
        await post('auth/register', { ...a, role: 'admin' }, 400);
        aInitial = sessionResponseSchema.parse(
          (await post('auth/register', a, 201)).payload,
        );
        bInitial = sessionResponseSchema.parse(
          (await post('auth/register', b, 201)).payload,
        );
        await post('auth/register', { ...a, email: 'ada@example.test' }, 409);
        assert.equal(aInitial.user.email, 'ada@example.test');
        const record = await db.user.findUniqueOrThrow({
          where: { email: aInitial.user.email },
          include: { profile: true, sessions: true },
        });
        assert.match(
          record.passwordHash,
          /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
        );
        assert.equal(await verify(record.passwordHash, a.password), true);
        assert.equal(record.profile.displayName, a.displayName);
        assert.equal(record.sessions.length, 1);
        assert.equal(
          record.sessions[0].refreshHash,
          sha(aInitial.refreshToken),
        );
        assert.equal(await db.user.count(), 2);
        assert.equal(await db.profile.count(), 2);
        assert.equal(await db.session.count(), 2);
        assert.equal(
          JSON.stringify(aInitial).includes(record.passwordHash),
          false,
        );

        await db.$runCommandRaw({
          collMod: 'Profile',
          validator: { displayName: { $ne: 'Rollback Test' } },
        });
        try {
          await post(
            'auth/register',
            registration('Rollback Test', 'rollback@example.test'),
            500,
          );
          assert.equal(
            await db.user.findUnique({
              where: { email: 'rollback@example.test' },
            }),
            null,
          );
          assert.equal(await db.profile.count(), 2);
          assert.equal(await db.session.count(), 2);
        } finally {
          await db.$runCommandRaw({ collMod: 'Profile', validator: {} });
        }
      },
    );

    await t.test(
      'generic login failures and JWT signature, issuer, audience and expiry checks',
      async () => {
        const wrong = (
          await post(
            'auth/login',
            { email: a.email, password: b.password },
            401,
          )
        ).payload;
        const unknown = (
          await post(
            'auth/login',
            { email: 'unknown@example.test', password: b.password },
            401,
          )
        ).payload;
        assert.deepEqual(
          { ...wrong, requestId: null },
          { ...unknown, requestId: null },
        );
        await post('auth/login', { email: a.email, password: a.password }, 200);
        const { sub, sid, iss, aud, iat, exp } = jwt.decode(
          aInitial.accessToken,
        );
        for (const [claims, key] of [
          [{ sub, sid, iss, aud, iat, exp }, randomBytes(32)],
          [{ sub, sid, iss: 'different-issuer', aud, iat, exp }, signingKey],
          [{ sub, sid, iss, aud: 'different-audience', iat, exp }, signingKey],
          [{ sub, sid, iss, aud, iat: iat - 600, exp: iat - 300 }, signingKey],
          [{ sub: bInitial.user.id, sid, iss, aud, iat, exp }, signingKey],
        ]) {
          await request('auth/me', {
            token: jwt.sign(claims, key, { algorithm: 'HS256' }),
            expected: 401,
          });
        }
        await request('auth/me', {
          token: aInitial.accessToken,
          expected: 200,
        });
      },
    );

    await t.test(
      'single-result rotation, concurrent operations and family replay revocation',
      async () => {
        const operationId = random();
        const input = { refreshToken: aInitial.refreshToken, operationId };
        const attempts = await Promise.all([
          post('auth/refresh', input, 200),
          post('auth/refresh', input, 200),
        ]);
        const rotated = attempts[0].payload;
        assert.equal(rotated.refreshToken, attempts[1].payload.refreshToken);
        assert.notEqual(rotated.refreshToken, aInitial.refreshToken);
        assert.equal(
          await db.spentRefresh.count({
            where: { hash: sha(aInitial.refreshToken) },
          }),
          1,
        );
        const next = await Promise.all(
          [
            post('auth/refresh', {
              refreshToken: rotated.refreshToken,
              operationId: random(),
            }),
            request('auth/refresh', {
              method: 'POST',
              body: {
                refreshToken: rotated.refreshToken,
                operationId: random(),
              },
              expected: undefined,
            }).catch((error) => error),
          ].map((promise) => promise.catch((error) => error)),
        );
        assert.equal(next.filter((result) => result.status === 409).length, 1);
        const winner = next.find(
          (result) => result.response?.status === 200,
        )?.payload;
        assert.ok(winner);
        await request('auth/me', { token: winner.accessToken, expected: 200 });
        await db.spentRefresh.update({
          where: { hash: sha(aInitial.refreshToken) },
          data: { rotatedAt: new Date(Date.now() - 60000) },
        });
        await post('auth/refresh', input, 409);
        await request('auth/me', { token: winner.accessToken, expected: 200 });
        await post(
          'auth/refresh',
          { refreshToken: aInitial.refreshToken, operationId: random() },
          401,
        );
        await request('auth/me', { token: winner.accessToken, expected: 401 });
        await post(
          'auth/refresh',
          { refreshToken: winner.refreshToken, operationId: random() },
          401,
        );

        await db.session.update({
          where: { refreshHash: sha(bInitial.refreshToken) },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await post(
          'auth/refresh',
          { refreshToken: bInitial.refreshToken, operationId: random() },
          401,
        );
        await request('auth/me', {
          token: bInitial.accessToken,
          expected: 401,
        });
      },
    );

    await t.test(
      'two client restarts, owner-only profiles, logout and cross-origin isolation',
      async () => {
        function clientApi(onRequest = () => undefined) {
          async function call(path, options) {
            onRequest(path);
            return (await request(path, options)).payload;
          }
          return {
            register: async (body) =>
              sessionResponseSchema.parse(
                await call('auth/register', { method: 'POST', body }),
              ),
            login: async (body) =>
              sessionResponseSchema.parse(
                await call('auth/login', { method: 'POST', body }),
              ),
            refresh: async (body) =>
              sessionResponseSchema.parse(
                await call('auth/refresh', { method: 'POST', body }),
              ),
            me: async (token) =>
              accountSchema.parse(await call('auth/me', { token })),
            update: async (body, token) =>
              accountSchema.parse(
                await call('users/me', { method: 'PATCH', body, token }),
              ),
            logout: (refreshToken) =>
              call('auth/logout', { method: 'POST', body: { refreshToken } }),
            logoutAll: (token) =>
              call('auth/logout-all', { method: 'POST', token }),
          };
        }
        function vault() {
          let value = null;
          return credentialStorage({
            get: async () => value,
            set: async (next) => {
              value = next;
            },
            remove: async () => {
              value = null;
            },
          });
        }
        const firstVault = vault();
        const secondVault = vault();
        const credentials = ({ email, password }) => ({ email, password });
        for (const [account, storage] of [
          [a, firstVault],
          [b, secondVault],
        ]) {
          const manager = new SessionManager(
            origin,
            clientApi(),
            storage,
            random,
          );
          await manager.restore();
          await manager.signIn(credentials(account));
          assert.equal(manager.snapshot().phase, 'authenticated');
        }
        const first = new SessionManager(
          origin,
          clientApi(),
          firstVault,
          random,
        );
        const second = new SessionManager(
          origin,
          clientApi(),
          secondVault,
          random,
        );
        await Promise.all([first.restore(), second.restore()]);
        assert.equal(first.snapshot().user.id, aInitial.user.id);
        assert.equal(second.snapshot().user.id, bInitial.user.id);
        await first.updateProfile({ displayName: 'Ada Updated' });
        assert.equal(first.snapshot().user.displayName, 'Ada Updated');
        assert.equal(second.snapshot().user.displayName, 'Ben Example');

        const bLogin = (await post('auth/login', credentials(b), 200)).payload;
        await request('users/me', { expected: 401 });
        await profile({ displayName: 'Blocked' }, undefined, 401);
        await profile(
          { displayName: 'Blocked', userId: aInitial.user.id },
          bLogin.accessToken,
          400,
        );
        await request(`users/${aInitial.user.id}`, {
          token: bLogin.accessToken,
          expected: 404,
        });
        assert.equal(
          (
            await request('users/me', {
              token: bLogin.accessToken,
              expected: 200,
            })
          ).payload.displayName,
          'Ben Example',
        );
        const aBeforeLogout = await firstVault.read();
        await first.signOut();
        assert.equal(await firstVault.read(), null);
        await post(
          'auth/logout',
          { refreshToken: aBeforeLogout.refreshToken },
          204,
        );
        await post(
          'auth/refresh',
          { refreshToken: aBeforeLogout.refreshToken, operationId: random() },
          401,
        );
        await second.signOut(true);
        await request('auth/me', { token: bLogin.accessToken, expected: 401 });
        assert.equal(await secondVault.read(), null);

        await first.restore();
        await first.signIn(credentials(a));
        let crossOriginRequests = 0;
        const differentOrigin = new SessionManager(
          'https://different-backend.example',
          clientApi(() => crossOriginRequests++),
          firstVault,
          random,
        );
        await differentOrigin.restore();
        assert.equal(crossOriginRequests, 0);
        assert.equal(await firstVault.read(), null);
        assert.equal(differentOrigin.snapshot().phase, 'unauthenticated');
      },
    );

    await t.test('login throttling has a bounded retry window', async () => {
      let status = 0;
      for (let tries = 0; tries < 20 && status !== 429; tries++) {
        const response = await fetch(origin + '/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        status = response.status;
        if (status === 429)
          assert.ok(Number(response.headers.get('retry-after')) > 0);
        await response.text();
      }
      assert.equal(status, 429);
    });
  },
);

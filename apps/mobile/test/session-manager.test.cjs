const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { credentialStorage } = require('../src/auth/credential-storage.ts');
const {
  SessionManager,
  sessionRoutes,
} = require('../src/auth/session-manager.ts');

const origin = 'https://chat.example.test';
const random = () => randomBytes(32).toString('base64url');
const account = {
  id: 'a'.repeat(24),
  email: 'person@example.test',
  displayName: 'Test Person',
  createdAt: new Date().toISOString(),
  avatarUrl: null,
};
const response = () => ({
  user: account,
  accessToken: random(),
  accessExpiresAt: new Date(Date.now() + 60000).toISOString(),
  refreshToken: random(),
});
const expired = () => Object.assign(new Error('unauthorized'), { status: 401 });

function vault(initial = null) {
  let raw = initial;
  const bridge = {
    get: async () => raw,
    set: async (value) => {
      raw = value;
    },
    remove: async () => {
      raw = null;
    },
  };
  return { bridge, store: credentialStorage(bridge) };
}

test('credential adapter stores only origin-bound refresh data and clears malformed records', async () => {
  const { store, bridge } = vault('broken-json');
  assert.equal(await store.read(), null);
  const stored = { origin, userId: account.id, refreshToken: random() };
  await store.write(stored);
  assert.deepEqual(await store.read(), stored);
  assert.equal('accessToken' in JSON.parse(await bridge.get()), false);
  await assert.rejects(store.write({ ...stored, accessToken: random() }));
  await store.clear();
  assert.equal(await bridge.get(), null);
});

test('cold restore preserves the pending operation across temporary failure and restart', async () => {
  const { store } = vault();
  const initial = response();
  await store.write({
    origin,
    userId: account.id,
    refreshToken: initial.refreshToken,
  });
  const operations = [];
  let available = false;
  const api = {
    async refresh(input) {
      operations.push(input);
      if (!available) throw new Error('network unavailable');
      return response();
    },
    me: async () => account,
  };
  const first = new SessionManager(origin, api, store, random);
  await first.restore();
  assert.equal(first.snapshot().phase, 'unavailable');
  assert.equal((await store.read()).refreshToken, initial.refreshToken);
  available = true;
  const restart = new SessionManager(origin, api, store, random);
  await restart.restore();
  assert.equal(restart.snapshot().phase, 'authenticated');
  assert.deepEqual(operations[0], operations[1]);
  assert.equal((await store.read()).pendingOperation, undefined);
});

test('single flight shares a refresh and clears revoked credentials on restart', async () => {
  const { store } = vault();
  let calls = 0;
  let invalid = false;
  const api = {
    login: async () => response(),
    refresh: async () => {
      calls++;
      if (invalid) throw expired();
      return response();
    },
    me: async () => account,
  };
  const manager = new SessionManager(origin, api, store, random);
  await manager.restore();
  await manager.signIn({ email: account.email, password: random() });
  const first = manager.refresh();
  const second = manager.refresh();
  assert.equal(first, second);
  await first;
  assert.equal(calls, 1);
  invalid = true;
  const restart = new SessionManager(origin, api, store, random);
  await restart.restore();
  assert.equal(restart.snapshot().phase, 'expired');
  assert.equal(await store.read(), null);
});

test('a retired secure record retries revocation without restoring an account', async () => {
  const { store } = vault();
  const oldToken = random();
  const requests = [];
  await store.write({
    origin,
    userId: account.id,
    refreshToken: oldToken,
    retired: true,
  });
  const manager = new SessionManager(
    origin,
    {
      refresh: async () => {
        throw new Error('refresh must not be attempted');
      },
      logout: async (token) => {
        requests.push(token);
      },
    },
    store,
    random,
  );
  await manager.restore();
  assert.equal(manager.snapshot().phase, 'unauthenticated');
  assert.deepEqual(requests, [oldToken]);
  assert.equal(await store.read(), null);
});

test('backend mismatch clears persisted credentials before opening a new origin', async () => {
  const { store } = vault();
  await store.write({ origin, userId: account.id, refreshToken: random() });
  let requests = 0;
  const manager = new SessionManager(
    'https://new.example.test',
    {
      refresh: async () => {
        requests++;
        return response();
      },
    },
    store,
    random,
  );
  await manager.restore();
  assert.equal(manager.snapshot().phase, 'unauthenticated');
  assert.equal(requests, 0);
  assert.equal(await store.read(), null);
});

test('logout during a refresh clears the successor and remains locally signed out during an outage', async () => {
  const { store } = vault();
  let finish;
  const refreshResult = new Promise((resolve) => {
    finish = resolve;
  });
  const api = {
    login: async () => response(),
    refresh: () => refreshResult,
    logout: async () => {
      throw new Error('offline');
    },
  };
  const manager = new SessionManager(origin, api, store, random);
  await manager.restore();
  await manager.signIn({ email: account.email, password: random() });
  const refreshing = manager.refresh();
  const closing = manager.signOut();
  finish(response());
  await Promise.all([refreshing, closing]);
  assert.equal(await store.read(), null);
  assert.match(manager.snapshot().note, /Signed out on this device/);
});

test('route guards admit only the routes for the active session phase', () => {
  assert.deepEqual(sessionRoutes('authenticated'), {
    signedIn: true,
    showAuth: false,
  });
  for (const phase of ['unauthenticated', 'expired', 'authenticating']) {
    assert.deepEqual(sessionRoutes(phase), { signedIn: false, showAuth: true });
  }
  for (const phase of [
    'initializing',
    'refreshing',
    'unavailable',
    'signing-out',
  ]) {
    assert.deepEqual(sessionRoutes(phase), {
      signedIn: false,
      showAuth: false,
    });
  }
});

test('switching accounts on one device yields a fresh account scope and credential', async () => {
  const { accountScopeKey } = require('../src/auth/account-scope.ts');
  const { store } = vault();
  const second = {
    ...account,
    id: 'b'.repeat(24),
    email: 'another@example.test',
  };
  const sessions = [response(), { ...response(), user: second }];
  const sent = [];
  const api = {
    login: async () => sessions.shift(),
    logout: async (token) => {
      sent.push(token);
    },
  };
  const manager = new SessionManager(origin, api, store, random);
  await manager.restore();
  await manager.signIn({ email: account.email, password: random() });
  const prior = await store.read();
  const initialScope = accountScopeKey({
    backendOrigin: origin,
    userId: manager.snapshot().user.id,
  });
  await manager.signOut();
  assert.equal(manager.snapshot().phase, 'unauthenticated');
  assert.deepEqual(sent, [prior.refreshToken]);
  await manager.signIn({ email: second.email, password: random() });
  assert.equal((await store.read()).userId, second.id);
  assert.notEqual((await store.read()).refreshToken, prior.refreshToken);
  assert.notEqual(
    accountScopeKey({ backendOrigin: origin, userId: second.id }),
    initialScope,
  );
  assert.notEqual(
    accountScopeKey({
      backendOrigin: 'https://other.example.test',
      userId: account.id,
    }),
    initialScope,
  );
});

test('background token rotation preserves authenticated routes and retries transient loss', async () => {
  const { store } = vault();
  const first = response();
  const next = response();
  let callable = false;
  const manager = new SessionManager(
    origin,
    {
      login: async () => first,
      refresh: async () => {
        if (!callable) throw new Error('network unavailable');
        return next;
      },
    },
    store,
    random,
  );
  await manager.restore();
  await manager.signIn({ email: account.email, password: random() });
  const changing = manager.refresh();
  assert.equal(sessionRoutes(manager.snapshot().phase).signedIn, true);
  await assert.rejects(changing);
  assert.equal(sessionRoutes(manager.snapshot().phase).signedIn, true);
  callable = true;
  assert.equal(
    await manager.authorized(async (token) => token),
    next.accessToken,
  );
  assert.equal(sessionRoutes(manager.snapshot().phase).signedIn, true);
});

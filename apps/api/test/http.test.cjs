const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { createApplication } = require('../dist/application.js');
const { loadEnvironment } = require('../dist/config/environment.js');
const {
  errorResponseSchema,
  healthResponseSchema,
} = require('@chatapp/contracts');

test('versioned HTTP endpoints and safe errors while database is unavailable', async (t) => {
  const environment = loadEnvironment({
    NODE_ENV: 'test',
    AUTH_SIGNING_KEY: randomBytes(32).toString('hex'),
    DATABASE_URL:
      'mongodb://127.0.0.1:1/chatapp_http_test?directConnection=true',
    CORS_ORIGINS: 'https://web.example.com',
  });
  const app = await createApplication(environment);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const headers = { Origin: 'https://web.example.com' };

  for (const [path, check] of [
    ['/v1/health', 'service'],
    ['/v1/health/live', 'live'],
  ]) {
    const response = await fetch(origin + path, { headers });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://web.example.com',
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(
      healthResponseSchema.parse(await response.json()).check,
      check,
    );
  }

  const response = await fetch(origin + '/v1/health/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(healthResponseSchema.parse(await response.json()), {
    service: 'chatapp-api',
    apiVersion: 'v1',
    environment: 'test',
    check: 'ready',
    status: 'unavailable',
    database: 'unavailable',
  });

  const missing = await fetch(origin + '/health');
  assert.equal(missing.status, 404);
  const body = errorResponseSchema.parse(await missing.json());
  assert.equal(body.requestId, missing.headers.get('x-request-id'));
});

test('invalid startup exits without printing a database secret', () => {
  const result = spawnSync(
    process.execPath,
    [join(__dirname, '../dist/main.js')],
    {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'invalid-sensitive-value' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid API configuration: DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /invalid-sensitive-value/);
});

test('authentication preflight respects the configured origin and omits cookies', async (t) => {
  const app = await createApplication(
    loadEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL:
        'mongodb://127.0.0.1:1/chatapp_http_test?directConnection=true',
      AUTH_SIGNING_KEY: randomBytes(32).toString('hex'),
      CORS_ORIGINS: 'https://client.example.test',
    }),
  );
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()) + '/v1/users/me';
  const options = (origin) => ({
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  const accepted = await fetch(url, options('https://client.example.test'));
  assert.equal(accepted.status, 204);
  assert.equal(
    accepted.headers.get('access-control-allow-origin'),
    'https://client.example.test',
  );
  assert.match(accepted.headers.get('access-control-allow-methods'), /PATCH/);
  assert.equal(accepted.headers.get('access-control-allow-credentials'), null);
  const rejected = await fetch(url, options('https://different.example.test'));
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

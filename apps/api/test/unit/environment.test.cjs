const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadEnvironment } = require('../../src/config/environment.ts');

const DATABASE_URL =
  'mongodb://127.0.0.1:27017/chatapp_dev?replicaSet=chatapp-rs';

test('sets safe bind defaults and MongoDB timeouts', () => {
  const result = loadEnvironment({ DATABASE_URL });
  assert.equal(result.HOST, '127.0.0.1');
  assert.equal(result.PORT, 3000);
  assert.match(result.DATABASE_URL, /serverSelectionTimeoutMS=2000/);
  assert.deepEqual(result.CORS_ORIGINS, []);
});

test('rejects missing and invalid configuration without echoing values', () => {
  assert.throws(() => loadEnvironment({}), {
    message: 'Invalid API configuration: DATABASE_URL',
  });
  assert.throws(
    () => loadEnvironment({ DATABASE_URL: 'postgres://hidden-value' }),
    {
      message: 'Invalid API configuration: DATABASE_URL',
    },
  );
  assert.throws(
    () => loadEnvironment({ DATABASE_URL, PORT: '0', NODE_ENV: 'something' }),
    {
      message: 'Invalid API configuration: PORT, NODE_ENV',
    },
  );
  assert.throws(() => loadEnvironment({ DATABASE_URL, CORS_ORIGINS: '*' }), {
    message: 'Invalid API configuration: CORS_ORIGINS',
  });
});

test('allows explicit HTTPS CORS origins in production', () => {
  const env = {
    DATABASE_URL,
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://example.com,https://example.com/',
  };
  assert.deepEqual(loadEnvironment(env).CORS_ORIGINS, ['https://example.com']);
  assert.throws(
    () => loadEnvironment({ ...env, CORS_ORIGINS: 'http://127.0.0.1:8081' }),
    /CORS_ORIGINS/,
  );
});

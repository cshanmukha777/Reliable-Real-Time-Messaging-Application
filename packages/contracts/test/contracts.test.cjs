const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  backendOriginSchema,
  configurationSchema,
  healthResponseSchema,
  errorResponseSchema,
  paginationSchema,
} = require('@chatapp/contracts');

test('normalizes an HTTPS origin and validates configuration', () => {
  assert.deepEqual(
    configurationSchema().parse({
      apiBaseUrl: ' https://Example.COM:443/ ',
      appearance: 'dark',
    }),
    { apiBaseUrl: 'https://example.com', appearance: 'dark' },
  );
});

test('rejects ambiguous, credential-bearing and unsupported origins', () => {
  for (const input of [
    'https://user:password@example.com',
    'https://example.com/?token=x',
    'https://example.com/#',
    'https://example.com/api',
    'https://example.com:',
    'https://example.com:0',
    'https://example.com:65536',
    'https://bad_host',
    'https://-bad.example',
    'https:///example.com',
    'https://example.com\\evil.test',
    'ftp://example.com',
    'wss://example.com',
    'localhost:3000',
  ]) {
    assert.equal(
      backendOriginSchema(true).safeParse(input).success,
      false,
      input,
    );
  }
});

test('only permits local cleartext with the development policy', () => {
  for (const input of [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://10.0.2.2:3000',
    'http://192.168.1.12:3000',
    'http://172.31.0.1',
  ]) {
    assert.equal(backendOriginSchema(true).parse(input), input);
    assert.equal(backendOriginSchema().safeParse(input).success, false);
  }
  for (const input of [
    'http://example.com',
    'http://127.evil.com',
    'http://8.8.8.8',
    'http://127.1',
    'http://0x7f000001',
  ]) {
    assert.equal(backendOriginSchema(true).safeParse(input).success, false);
  }
});

test('validates response versions, error bodies and pagination limits', () => {
  const health = {
    service: 'chatapp-api',
    apiVersion: 'v1',
    environment: 'test',
    status: 'ok',
    check: 'service',
  };
  assert.deepEqual(healthResponseSchema.parse(health), health);
  assert.equal(
    healthResponseSchema.safeParse({ ...health, apiVersion: 'v2' }).success,
    false,
  );
  assert.equal(
    errorResponseSchema.safeParse({ statusCode: 503, code: 'FAIL' }).success,
    false,
  );
  assert.equal(paginationSchema.parse({}).limit, 25);
  assert.equal(paginationSchema.safeParse({ limit: '101' }).success, false);
});

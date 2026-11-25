const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { ApiClient } = require('../src/api-client.ts');

test('client accepts the expected health contract and rejects incorrect servers or redirects', async (t) => {
  let reply = {
    service: 'chatapp-api',
    status: 'ok',
    check: 'service',
    apiVersion: 'v1',
    environment: 'test',
  };
  const server = createServer((request, response) => {
    assert.equal(request.url, '/v1/health');
    if (reply === null) {
      response.writeHead(302, { Location: 'https://example.com/' });
      response.end();
      return;
    }
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(reply));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new ApiClient(`http://127.0.0.1:${server.address().port}`);
  assert.equal((await client.health()).apiVersion, 'v1');
  reply = { ...reply, service: 'other-service' };
  await assert.rejects(client.health(), /compatible ChatApp/);
  reply = null;
  await assert.rejects(client.health());
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { MessagingApi } = require('../src/messaging/api.ts');
const { SendAttempt, mergeMessages } = require('../src/messaging/draft.ts');
const { pickerInput } = require('../src/messaging/picker-input.ts');
const { inboxRow, threadEntries } = require('../src/messaging/view-model.ts');

const id = 'a'.repeat(24);
const peer = { id: 'b'.repeat(24), displayName: 'Ben', avatarUrl: null };
const me = { id: 'c'.repeat(24), displayName: 'Ada', avatarUrl: null };
const message = {
  id: 'd'.repeat(24),
  conversationId: id,
  sender: me,
  body: 'Lab notes',
  attachments: [],
  deleted: false,
  createdAt: '2026-11-27T12:34:00.000Z',
};

function setup(handle) {
  const calls = [];
  const session = {
    origin: 'https://configured.example.test',
    authorized: async (request) => request('example-access'),
  };
  const api = new MessagingApi(session, async (url, options) => {
    calls.push({ url, options });
    const result = await handle(url, options);
    return {
      url,
      redirected: false,
      ok: true,
      status: 200,
      json: async () => result,
      ...result?.response,
    };
  });
  return { api, calls };
}

test('service uses account session and configured origin and validates returned people', async () => {
  const { api, calls } = setup(() => [peer]);
  assert.deepEqual(await api.discover('Ben Smith'), [peer]);
  assert.equal(
    calls[0].url,
    'https://configured.example.test/v1/users/discover?q=Ben+Smith',
  );
  assert.equal(calls[0].options.headers.Authorization, 'Bearer example-access');
  assert.equal(calls[0].options.redirect, 'error');
  const external = setup(() => ({
    response: { url: 'https://unknown.example.test', redirected: true },
  }));
  await assert.rejects(external.api.list(), { code: 'UNEXPECTED_ORIGIN' });
  const privateFields = setup(() => [{ ...peer, email: 'hidden' }]);
  await assert.rejects(privateFields.api.discover('Ben'));
});

test('failed send leaves text and verified attachment in the same scoped operation', async () => {
  let tries = 0;
  const { api, calls } = setup(() => {
    if (++tries === 1) throw new Error('Simulated lost response');
    return message;
  });
  const send = new SendAttempt(randomUUID);
  const attachments = ['e'.repeat(24)];
  const first = send.payload('  Lab notes ', attachments);
  await assert.rejects(api.send(id, first));
  const retry = send.payload('Lab notes', [...attachments]);
  assert.equal(retry, first);
  assert.deepEqual(await api.send(id, retry), message);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.notEqual(
    send.payload('Edited', attachments).clientMessageId,
    first.clientMessageId,
  );
  send.confirmed();
  assert.notEqual(
    send.payload('Lab notes', attachments).clientMessageId,
    first.clientMessageId,
  );
});

test('inbox and thread render models encode real peer names, attachment metadata and only confirmed sent state', () => {
  const row = {
    id,
    kind: 'DIRECT',
    title: 'Ben',
    members: [me, peer],
    latest: message,
  };
  assert.equal(inboxRow(row, me.id).people[0].name, 'Ben');
  assert.equal(inboxRow(row, me.id).preview, 'Lab notes');
  const incoming = {
    ...message,
    id: 'e'.repeat(24),
    sender: peer,
    attachments: [
      {
        id: 'f'.repeat(24),
        fileName: 'plan.png',
        size: 2048,
        mimeType: 'image/png',
      },
    ],
  };
  const removed = { ...message, id: '9'.repeat(24), deleted: true };
  const entries = threadEntries([incoming, message, removed], me.id, true);
  assert.equal(entries[0].divider, 'date');
  assert.equal(entries[1].status, 'sent');
  assert.equal(entries[2].author, 'Ben');
  assert.equal(entries[2].status, undefined);
  assert.equal(entries[2].attachments[0].detail, '2 KB');
  assert.deepEqual(mergeMessages([message], [message]), [message]);
});

test('picker cancellation is inert and invalid selected files are refused', () => {
  assert.equal(pickerInput(null), null);
  const asset = {
    uri: 'file:///temporary',
    name: 'notes.txt',
    mimeType: 'text/plain',
    size: 10,
  };
  assert.equal(pickerInput(asset).input.size, 10);
  assert.throws(() => pickerInput({ ...asset, mimeType: 'text/html' }));
  assert.throws(() =>
    pickerInput({ ...asset, uri: 'https://external.example.test' }),
  );
});

test('group selection and scoped search stay in REST path; deletion handles denial and empty success', async () => {
  const draft = {
    userIds: [peer.id],
    title: 'Lab group',
    clientGroupId: randomUUID(),
  };
  const conversation = {
    id,
    kind: 'GROUP',
    title: draft.title,
    members: [],
    role: 'OWNER',
    latest: null,
    updatedAt: message.createdAt,
  };
  const { api, calls } = setup((url, options) => {
    if (url.endsWith('/group')) return conversation;
    if (options.method === 'DELETE') return { response: { status: 204 } };
    return { items: [], nextCursor: null };
  });
  assert.deepEqual(await api.group(draft), conversation);
  assert.deepEqual(JSON.parse(calls[0].options.body), draft);
  assert.deepEqual(await api.search(id, 'lab notes'), {
    items: [],
    nextCursor: null,
  });
  assert.match(calls[1].url, /\/conversations\/a+\/search\?q=lab\+notes$/);
  await api.remove(id, message.id);
  assert.equal(calls[2].options.method, 'DELETE');
  const denied = setup(() => ({ response: { ok: false, status: 403 } }));
  await assert.rejects(denied.api.remove(id, message.id), { status: 403 });
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const {
  groupInputSchema,
  messageInputSchema,
  personSchema,
  searchQuerySchema,
  uploadInputSchema,
} = require('../dist');

const id = '1234567890abcdef12345678';

test('messaging contracts reject empty, duplicate and oversized sends', () => {
  assert.deepEqual(
    messageInputSchema.parse({
      clientMessageId: randomUUID(),
      body: '  hello ',
    }).body,
    'hello',
  );
  for (const input of [
    { body: ' ' },
    { body: 'x'.repeat(4001) },
    { attachmentIds: [id, id] },
    { attachmentIds: ['../../secret'] },
    { body: 'hello', senderId: id },
  ])
    assert.equal(
      messageInputSchema.safeParse({ clientMessageId: randomUUID(), ...input })
        .success,
      false,
    );
  assert.equal(
    messageInputSchema.safeParse({ clientMessageId: 'bad', body: 'hello' })
      .success,
    false,
  );
  assert.equal(
    messageInputSchema.safeParse({
      clientMessageId: randomUUID(),
      attachmentIds: [id],
    }).success,
    true,
  );
});

test('public profile, group and search inputs fail closed', () => {
  assert.equal(
    personSchema.safeParse({
      id,
      displayName: 'Ada',
      avatarUrl: null,
      email: 'private',
    }).success,
    false,
  );
  assert.equal(
    groupInputSchema.safeParse({
      clientGroupId: randomUUID(),
      title: ' ',
      userIds: [id],
    }).success,
    false,
  );
  for (const q of ['x', '"match"', '-match', 'x'.repeat(81)])
    assert.equal(searchQuerySchema.safeParse({ q }).success, false);
  assert.equal(
    searchQuerySchema.safeParse({ q: 'term', limit: '51' }).success,
    false,
  );
  assert.equal(
    searchQuerySchema.parse({ q: 'field notes', limit: '7' }).limit,
    7,
  );
});

test('upload metadata rejects unsafe names, types and sizes', () => {
  const original = {
    fileName: 'report.txt',
    mimeType: 'text/plain',
    size: 100,
  };
  assert.equal(uploadInputSchema.safeParse(original).success, true);
  for (const update of [
    { fileName: '../a.txt' },
    { fileName: 'bad\\a.txt' },
    { fileName: 'bad\nname.txt' },
    { mimeType: 'text/html' },
    { mimeType: 'application/x-executable' },
    { size: 0 },
    { size: 10485761 },
  ])
    assert.equal(
      uploadInputSchema.safeParse({ ...original, ...update }).success,
      false,
    );
});

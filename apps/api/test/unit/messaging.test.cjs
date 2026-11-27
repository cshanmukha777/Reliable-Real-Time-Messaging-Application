const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  directPair,
  fingerprint,
  memberAuthority,
  encodeCursor,
  decodeCursor,
} = require('../../src/messaging/policy.ts');
const { verifyBytes } = require('../../src/messaging/attachment-policy.ts');

test('direct pairs are reciprocal and self-pairs are rejected', () => {
  assert.deepEqual(directPair('b', 'a'), ['a', 'b']);
  assert.deepEqual(directPair('b', 'a'), directPair('a', 'b'));
  assert.throws(() => directPair('a', 'a'), { status: 400 });
});

test('only owner can manage admins; owner cannot be replaced or removed', () => {
  for (const args of [
    ['OWNER', 'MEMBER', 'ADMIN'],
    ['OWNER', 'ADMIN', null],
    ['ADMIN', 'MEMBER', null],
    ['ADMIN', undefined, 'MEMBER'],
  ])
    assert.doesNotThrow(() => memberAuthority(...args));
  for (const args of [
    ['OWNER', 'OWNER', 'ADMIN'],
    ['OWNER', 'OWNER', null],
    ['OWNER', 'MEMBER', 'OWNER'],
    ['ADMIN', 'ADMIN', null],
    ['ADMIN', 'MEMBER', 'ADMIN'],
    ['MEMBER', 'MEMBER', null],
  ])
    assert.throws(() => memberAuthority(...args), { status: 403 });
});

test('fingerprints bind conversation, body and attachment order', () => {
  const canonical = fingerprint(['scope-a', 'hello', ['a', 'b']]);
  assert.equal(canonical, fingerprint(['scope-a', 'hello', ['a', 'b']]));
  for (const update of [
    ['scope-b', 'hello', ['a', 'b']],
    ['scope-a', 'edited', ['a', 'b']],
    ['scope-a', 'hello', ['b', 'a']],
  ])
    assert.notEqual(canonical, fingerprint(update));
});

test('history cursors are canonical date and ID pairs', () => {
  const tuple = {
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'a'.repeat(24),
  };
  const encoded = encodeCursor(tuple);
  assert.deepEqual(decodeCursor(encoded), tuple);
  for (const value of [
    'invalid',
    encoded + '=',
    encodeCursor({ ...tuple, id: 'x' }),
  ]) {
    assert.throws(() => decodeCursor(value), { status: 400 });
  }
});

test('attachment verification requires matching length and plausible content', () => {
  const testContent = (bytes, mimeType, size = bytes.length) =>
    verifyBytes(bytes, { fileName: 'upload', mimeType, size });
  const safe = Buffer.from('Visible text\nSecond line');
  assert.doesNotThrow(() => testContent(safe, 'text/plain'));
  assert.throws(() => testContent(safe, 'text/plain', safe.length + 1), {
    status: 400,
  });
  assert.throws(() => testContent(safe, 'image/jpeg'), { status: 400 });
  for (const value of [
    Buffer.from('<html>fake</html>'),
    Buffer.from([0xff, 0xf0]),
    Buffer.from('MZ\x00unsafe'),
  ]) {
    assert.throws(() => testContent(value, 'text/plain'), { status: 400 });
  }
});

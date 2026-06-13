import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircleW3SClient, CircleError, generateEntitySecret } from '../src/circle/index.js';

test('generateEntitySecret yields a random 32-byte hex string', () => {
  const s = generateEntitySecret();
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.notEqual(generateEntitySecret(), s);
});

test('constructor rejects an empty apiKey', () => {
  assert.throws(() => new CircleW3SClient({ apiKey: '' }), CircleError);
});

test('freshCiphertext refuses to run without an entity secret (before any network call)', async () => {
  const c = new CircleW3SClient({ apiKey: 'TEST_API_KEY:id:secret' });
  await assert.rejects(() => c.freshCiphertext(), /entitySecret is required/);
});

test('CircleError carries the Circle code and HTTP status', () => {
  const e = new CircleError('156016', 'nope', 403);
  assert.equal(e.code, '156016');
  assert.equal(e.status, 403);
  assert.equal(e.name, 'CircleError');
});

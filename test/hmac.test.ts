import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMacKey, tag, verifyTag, MAC_KEY_BYTES, TAG_BYTES } from '../src/hmac.js';

const secret = () => crypto.getRandomValues(new Uint8Array(MAC_KEY_BYTES));
const msg = (s: string) => new TextEncoder().encode(s);

test('deriveMacKey is deterministic per (secret, jti) and 32 bytes', () => {
  const s = secret();
  const k1 = deriveMacKey(s, 'jti-aaa');
  const k2 = deriveMacKey(s, 'jti-aaa');
  assert.equal(k1.length, MAC_KEY_BYTES);
  assert.deepEqual(k1, k2);
});

test('a different jti yields a different MAC key (binds the MAC to the capability)', () => {
  const s = secret();
  assert.notDeepEqual(deriveMacKey(s, 'jti-aaa'), deriveMacKey(s, 'jti-bbb'));
});

test('tag -> verifyTag round-trips; tag is 20 bytes (Blake3-160)', () => {
  const key = deriveMacKey(secret(), 'jti');
  const m = msg('settle task A3');
  const t = tag(key, m);
  assert.equal(t.length, TAG_BYTES);
  assert.equal(verifyTag(key, m, t), true);
});

test('a tampered message, a wrong key, and a MAC from another token are all rejected', () => {
  const s = secret();
  const key = deriveMacKey(s, 'jti-1');
  const m = msg('action: pay 1 USDC');
  const t = tag(key, m);
  assert.equal(verifyTag(key, msg('action: pay 99 USDC'), t), false); // tampered message
  assert.equal(verifyTag(deriveMacKey(secret(), 'jti-1'), m, t), false); // wrong secret
  assert.equal(verifyTag(deriveMacKey(s, 'jti-2'), m, t), false);        // MAC from another token's key
});

test('a wrong-length tag or key is rejected without throwing', () => {
  const key = deriveMacKey(secret(), 'jti');
  const m = msg('x');
  assert.equal(verifyTag(key, m, new Uint8Array(19)), false);
  assert.equal(verifyTag(new Uint8Array(31), m, tag(key, m)), false);
});

test('deriveMacKey and tag reject wrong-length key material', () => {
  assert.throws(() => deriveMacKey(new Uint8Array(16), 'jti'), /token secret must be 32 bytes/);
  assert.throws(() => tag(new Uint8Array(16), msg('x')), /MAC key must be 32 bytes/);
});

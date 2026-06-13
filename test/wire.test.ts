import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@noble/hashes/utils.js';
import { canonicalize, canonicalBytes, frameSignature, unframeSignature } from '../src/wire.js';
import { canonicalTokenBytes } from '../src/zsp.js';
import { SignatureScheme, type ZspToken } from '../src/types.js';

test('canonicalize is deterministic and independent of object property order', () => {
  const a = { b: 1, a: [3, 2], c: { y: 1, x: 2 } };
  const b = { c: { x: 2, y: 1 }, a: [3, 2], b: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(canonicalize(a), '{"a":[3,2],"b":1,"c":{"x":2,"y":1}}');
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1])); // arrays keep order (meaningful)
});

test('canonicalBytes is the UTF-8 of canonicalize', () => {
  const v = { z: 'x', a: 1 };
  assert.equal(Buffer.from(canonicalBytes(v)).toString('utf8'), canonicalize(v));
});

test('zsp token encoding goes through the shared wire codec (one source of truth)', () => {
  const token: ZspToken = { v: 1, jti: 'a1', sub: 'ff', aud: 'h', scope: ['p'], nbf: 1, exp: 2, scheme: SignatureScheme.AgentMlDsa65 };
  assert.equal(bytesToHex(canonicalTokenBytes(token)), bytesToHex(canonicalBytes(token)));
});

test('frame/unframe round-trips and preserves the signature_scheme byte', () => {
  const sig = new Uint8Array([9, 8, 7, 6]);
  const framed = frameSignature(SignatureScheme.AgentMlDsa65, sig);
  assert.equal(framed.length, sig.length + 1);
  assert.equal(framed[0], SignatureScheme.AgentMlDsa65);
  const { scheme, sig: out } = unframeSignature(framed);
  assert.equal(scheme, SignatureScheme.AgentMlDsa65);
  assert.equal(bytesToHex(out), bytesToHex(sig));
});

test('unframing an empty buffer throws', () => {
  assert.throws(() => unframeSignature(new Uint8Array(0)), /empty/);
});

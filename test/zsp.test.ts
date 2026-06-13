import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateAgentKeyPair, sign, fingerprint } from '../src/keys.js';
import {
  mintZspToken,
  verifyZspToken,
  authorizeZspToken,
  canonicalTokenBytes,
  createCapabilityManager,
} from '../src/zsp.js';
import { SignatureScheme, type ZspToken } from '../src/types.js';

const NOW = 1_900_000_000; // fixed clock for deterministic time checks

test('mint -> authorize: a scoped, in-window token for the right action+audience passes', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'handoff:request:963632e8', scope: ['update_task', 'submit_result'], ttlSeconds: 300, nbf: NOW });
  const r = authorizeZspToken(cap, { action: 'update_task', aud: 'handoff:request:963632e8', now: NOW + 10 });
  assert.equal(r.ok, true);
  assert.equal(cap.token.sub, fingerprint(kp.params, kp.publicKey));
  assert.equal(cap.token.scheme, SignatureScheme.AgentMlDsa65);
});

test('validity is not authorization: a valid token is still denied an out-of-scope action', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'h', scope: ['update_task'], ttlSeconds: 300, nbf: NOW });
  assert.equal(verifyZspToken(cap, { now: NOW + 1 }).ok, true); // genuine + live
  assert.deepEqual(authorizeZspToken(cap, { action: 'delete_project', aud: 'h', now: NOW + 1 }), { ok: false, reason: 'out-of-scope' });
});

test('wrong audience is rejected even when the action is in scope', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'project-A', scope: ['x'], ttlSeconds: 300, nbf: NOW });
  assert.deepEqual(authorizeZspToken(cap, { action: 'x', aud: 'project-B', now: NOW + 1 }), { ok: false, reason: 'wrong-audience' });
});

test('expired and not-yet-valid windows are enforced', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'h', scope: ['x'], ttlSeconds: 60, nbf: NOW });
  assert.deepEqual(verifyZspToken(cap, { now: cap.token.exp }), { ok: false, reason: 'expired' }); // exp is exclusive
  assert.deepEqual(verifyZspToken(cap, { now: NOW - 1 }), { ok: false, reason: 'not-yet-valid' });
});

test('a tampered token (scope widened after mint) fails the signature check', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'h', scope: ['read'], ttlSeconds: 300, nbf: NOW });
  cap.token.scope.push('write'); // attacker tries to widen privilege
  assert.deepEqual(authorizeZspToken(cap, { action: 'write', aud: 'h', now: NOW + 1 }), { ok: false, reason: 'bad-signature' });
});

test("a token signed by A but presented with B's public key is rejected", () => {
  const a = generateAgentKeyPair();
  const b = generateAgentKeyPair();
  const cap = mintZspToken(a, { aud: 'h', scope: ['x'], ttlSeconds: 300, nbf: NOW });
  const forged = { token: cap.token, sig: cap.sig, pub: bytesToHex(b.publicKey) };
  assert.equal(verifyZspToken(forged, { now: NOW + 1 }).ok, false);
});

test('subject-binding: a valid signature over a token whose sub != signer fingerprint is rejected', () => {
  const a = generateAgentKeyPair();
  const b = generateAgentKeyPair();
  // hand-craft a token claiming B as subject, but sign it with A and present A's key
  const token: ZspToken = {
    v: 1, jti: 'deadbeef', sub: fingerprint(b.params, b.publicKey), aud: 'h',
    scope: ['x'], nbf: NOW, exp: NOW + 60, scheme: a.scheme,
  };
  const sig = sign(a, canonicalTokenBytes(token), { context: new TextEncoder().encode('impute/zsp/v1') });
  const crafted = { token, sig: bytesToHex(sig), pub: bytesToHex(a.publicKey) };
  assert.deepEqual(verifyZspToken(crafted, { now: NOW + 1 }), { ok: false, reason: 'subject-mismatch' });
});

test('mint rejects a non-positive TTL and a non-agent scheme', () => {
  const kp = generateAgentKeyPair();
  assert.throws(() => mintZspToken(kp, { aud: 'h', scope: [], ttlSeconds: 0, nbf: NOW }), /ttlSeconds must be > 0/);
  const humanKp = { ...kp, scheme: SignatureScheme.HumanMayo };
  assert.throws(() => mintZspToken(humanKp, { aud: 'h', scope: [], ttlSeconds: 60 }), /Tier-1 agent key/);
});

test('canonical encoding is independent of property order (signer/verifier agree)', () => {
  const base = { v: 1, jti: 'a1', sub: 'ff', aud: 'h', scope: ['p', 'q'], nbf: NOW, exp: NOW + 60, scheme: 1 };
  const reordered = { scheme: 1, exp: NOW + 60, nbf: NOW, scope: ['p', 'q'], aud: 'h', sub: 'ff', jti: 'a1', v: 1 };
  assert.equal(
    bytesToHex(canonicalTokenBytes(base as ZspToken)),
    bytesToHex(canonicalTokenBytes(reordered as ZspToken)),
  );
});

test('capability manager mints, authorizes, burns (revokes), and fires lifecycle hooks', () => {
  const minted: string[] = [];
  const burned: Array<[string, string]> = [];
  const mgr = createCapabilityManager({
    onMint: (t) => minted.push(t.jti),
    onBurn: (jti, reason) => burned.push([jti, reason]),
  });
  const kp = generateAgentKeyPair();
  const cap = mgr.mint(kp, { aud: 'h', scope: ['update_task'], ttlSeconds: 300, nbf: NOW });
  assert.equal(mgr.authorize(cap, { action: 'update_task', aud: 'h', now: NOW + 1 }).ok, true);
  mgr.burn(cap.token.jti, 'verified');
  assert.deepEqual(mgr.authorize(cap, { action: 'update_task', aud: 'h', now: NOW + 1 }), { ok: false, reason: 'revoked' });
  assert.deepEqual(minted, [cap.token.jti]);
  assert.deepEqual(burned, [[cap.token.jti, 'verified']]);
});

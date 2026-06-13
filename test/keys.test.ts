import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { generateAgentKeyPair, publicIdentity, fingerprint, sign, verifyAgent } from '../src/keys.js';
import { SignatureScheme } from '../src/types.js';

// Official NIST ACVP FIPS-204 ML-DSA-65 known-answer vectors (provenance in the file).
const KAT = JSON.parse(
  readFileSync(new URL('../../test/vectors/ml-dsa-65-acvp.json', import.meta.url), 'utf8'),
);

test('FIPS-204 ML-DSA-65 keyGen KATs: a seed reproduces the exact (pk, sk)', () => {
  assert.ok(KAT.keyGen.length >= 3);
  for (const v of KAT.keyGen) {
    const kp = generateAgentKeyPair('ml-dsa-65', hexToBytes(v.seed));
    assert.equal(bytesToHex(kp.publicKey), v.pk.toLowerCase(), `tcId ${v.tcId} pk`);
    assert.equal(bytesToHex(kp.secretKey), v.sk.toLowerCase(), `tcId ${v.tcId} sk`);
  }
});

test('FIPS-204 ML-DSA-65 sigVer KATs: valid signatures verify, tampered ones are rejected', () => {
  assert.ok(KAT.sigVer.some((v: { testPassed: boolean }) => v.testPassed === false), 'need tamper cases');
  for (const v of KAT.sigVer) {
    const r = verifyAgent(
      { params: 'ml-dsa-65', publicKey: hexToBytes(v.pk) },
      hexToBytes(v.message),
      hexToBytes(v.signature),
      { context: hexToBytes(v.context) },
    );
    assert.equal(r.ok, v.testPassed, `tcId ${v.tcId} (${v.reason})`);
  }
});

test('fingerprint is stable, 20 bytes, and binds the parameter set', () => {
  const seed = hexToBytes(KAT.keyGen[0].seed);
  const a = generateAgentKeyPair('ml-dsa-65', seed);
  const b = generateAgentKeyPair('ml-dsa-65', seed);
  const fpA = fingerprint('ml-dsa-65', a.publicKey);
  assert.equal(fpA.length, 40, '20 bytes hex');
  assert.equal(fpA, fingerprint('ml-dsa-65', b.publicKey), 'stable across keygen of the same seed');
  assert.notEqual(fpA, fingerprint('ml-dsa-87', a.publicKey), 'same key bytes, different param -> different id');
});

test('publicIdentity carries the right scheme byte + fingerprint and never the secret key', () => {
  const kp = generateAgentKeyPair('ml-dsa-65', hexToBytes(KAT.keyGen[0].seed));
  const id = publicIdentity(kp);
  assert.equal(id.scheme, SignatureScheme.AgentMlDsa65);
  assert.equal(id.fingerprint, fingerprint('ml-dsa-65', kp.publicKey));
  assert.ok(!('secretKey' in id));
});

test('round-trip: our own signature verifies; wrong context and tamper are rejected', () => {
  const kp = generateAgentKeyPair('ml-dsa-65');
  const msg = new TextEncoder().encode('claim task A3 under a ZSP token');
  const ctx = new TextEncoder().encode('handoff:request:963632e8');
  const sig = sign(kp, msg, { context: ctx });
  assert.equal(verifyAgent(kp, msg, sig, { context: ctx }).ok, true);
  assert.equal(verifyAgent(kp, msg, sig, { context: new TextEncoder().encode('other-ctx') }).ok, false);
  const bad = sig.slice();
  bad[0] = bad[0]! ^ 1;
  assert.equal(verifyAgent(kp, msg, bad, { context: ctx }).ok, false);
});

test('a 31-byte seed is rejected (FIPS-204 needs exactly 32)', () => {
  assert.throws(() => generateAgentKeyPair('ml-dsa-65', new Uint8Array(31)), /seed must be 32 bytes/);
});

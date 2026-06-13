import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateAgentKeyPair, sign, fingerprint, verifyAgent } from '../../src/keys.js';
import {
  mintZspToken,
  verifyZspToken,
  authorizeZspToken,
} from '../../src/zsp.js';
import { produceQuote, verifyQuote } from '../../src/attest.js';
import { deriveMacKey, tag, verifyTag } from '../../src/hmac.js';

const NOW = 1_900_000_000;

// (1) replay an EXPIRED ZSP token -> verifyZspToken must return {ok:false,reason:'expired'}
test('Adversarial Scenario 1: Replay an EXPIRED ZSP token is rejected', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'handoff', scope: ['update_task'], ttlSeconds: 10, nbf: NOW });
  // Verify at exp should fail (exclusive exp boundary)
  const result = verifyZspToken(cap, { now: NOW + 10 });
  assert.deepEqual(result, { ok: false, reason: 'expired' });
});

// (2) present an out-of-scope action -> authorizeZspToken must reject
test('Adversarial Scenario 2: Presenting an out-of-scope action is rejected', () => {
  const kp = generateAgentKeyPair();
  const cap = mintZspToken(kp, { aud: 'handoff', scope: ['read_task'], ttlSeconds: 300, nbf: NOW });
  const result = authorizeZspToken(cap, { action: 'delete_project', aud: 'handoff', now: NOW + 1 });
  assert.deepEqual(result, { ok: false, reason: 'out-of-scope' });
});

// (3) forge: sign a token with key A but present key B -> must reject; tamper an attestation quote -> verifyQuote 'bad-signature'
test('Adversarial Scenario 3a: Forge token - signed with key A but presented with key B is rejected', () => {
  const a = generateAgentKeyPair();
  const b = generateAgentKeyPair();
  const cap = mintZspToken(a, { aud: 'handoff', scope: ['update_task'], ttlSeconds: 300, nbf: NOW });
  
  // Present key B but keep signature signed by key A
  const forged = { token: cap.token, sig: cap.sig, pub: bytesToHex(b.publicKey) };
  const result = verifyZspToken(forged, { now: NOW + 1 });
  // It fails because of signature verification failure against B's key, or subject fingerprint mismatch
  assert.equal(result.ok, false);
});

test('Adversarial Scenario 3b: Tamper attestation quote -> verifyQuote bad-signature', () => {
  const kp = generateAgentKeyPair();
  const fp = fingerprint(kp.params, kp.publicKey);
  const nonce = new Uint8Array(16);
  const quote = produceQuote(fp, { nonce });
  
  // Tamper the enclaveMeasurement in the quote to break signature verification
  quote.enclaveMeasurement = '00'.repeat(32);
  const result = verifyQuote(quote, { fingerprint: fp, nonce });
  assert.deepEqual(result, { ok: false, reason: 'bad-signature' });
});

// (4) wrong-context ML-DSA sig -> reject
test('Adversarial Scenario 4: Wrong-context ML-DSA signature is rejected', () => {
  const kp = generateAgentKeyPair('ml-dsa-65');
  const msg = new TextEncoder().encode('task submission data');
  const correctCtx = new TextEncoder().encode('handoff:verify:correct');
  const wrongCtx = new TextEncoder().encode('handoff:verify:wrong');
  
  const sig = sign(kp, msg, { context: correctCtx });
  
  const verifiedCorrect = verifyAgent(kp, msg, sig, { context: correctCtx });
  assert.equal(verifiedCorrect.ok, true);
  
  const verifiedWrong = verifyAgent(kp, msg, sig, { context: wrongCtx });
  assert.equal(verifiedWrong.ok, false);
});

// (5) MAC from another token's key -> verifyTag false
test('Adversarial Scenario 5: MAC from another token\'s key is rejected', () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const key1 = deriveMacKey(secret, 'jti-token-1');
  const key2 = deriveMacKey(secret, 'jti-token-2'); // different JTI/token key
  
  const message = new TextEncoder().encode('verify result');
  const macFromToken1 = tag(key1, message);
  
  // Verifying token 1's tag with token 2's key must return false
  const verified = verifyTag(key2, message, macFromToken1);
  assert.equal(verified, false);
});

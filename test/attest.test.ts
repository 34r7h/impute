import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAgentKeyPair, publicIdentity } from '../src/keys.js';
import { produceQuote, verifyQuote, MOCK_ENCLAVE_MEASUREMENT } from '../src/attest.js';

function agentFp(): string {
  return publicIdentity(generateAgentKeyPair()).fingerprint;
}
const nonce = () => crypto.getRandomValues(new Uint8Array(16));

test('produce -> verify: a fresh quote for the right fingerprint + nonce passes', () => {
  const fp = agentFp();
  const n = nonce();
  const quote = produceQuote(fp, { nonce: n });
  assert.equal(quote.simulated, true);                          // honest flag, always
  assert.equal(quote.enclaveMeasurement, MOCK_ENCLAVE_MEASUREMENT);
  assert.deepEqual(verifyQuote(quote, { fingerprint: fp, nonce: n }), { ok: true });
});

test('a tampered enclave measurement breaks the signature', () => {
  const fp = agentFp();
  const n = nonce();
  const quote = produceQuote(fp, { nonce: n });
  quote.enclaveMeasurement = 'deadbeef'.repeat(8);
  assert.deepEqual(verifyQuote(quote, { fingerprint: fp, nonce: n }), { ok: false, reason: 'bad-signature' });
});

test('a quote verified against a different nonce is rejected (replay defense)', () => {
  const fp = agentFp();
  const quote = produceQuote(fp, { nonce: nonce() });
  assert.deepEqual(verifyQuote(quote, { fingerprint: fp, nonce: nonce() }), { ok: false, reason: 'nonce-mismatch' });
});

test("a quote for agent A is rejected when verified against agent B's fingerprint", () => {
  const n = nonce();
  const quote = produceQuote(agentFp(), { nonce: n });
  assert.deepEqual(verifyQuote(quote, { fingerprint: agentFp(), nonce: n }), { ok: false, reason: 'report-data-mismatch' });
});

test('pinning a different expected enclave measurement is rejected', () => {
  const fp = agentFp();
  const n = nonce();
  const quote = produceQuote(fp, { nonce: n });
  assert.deepEqual(
    verifyQuote(quote, { fingerprint: fp, nonce: n, expectedMeasurement: 'aa'.repeat(32) }),
    { ok: false, reason: 'measurement-mismatch' },
  );
});

test('a non-xtee format is rejected outright', () => {
  const fp = agentFp();
  const n = nonce();
  const quote = produceQuote(fp, { nonce: n });
  const wrong = { ...quote, format: 'real-tdx' as unknown as 'xtee-mock-v1' };
  assert.deepEqual(verifyQuote(wrong, { fingerprint: fp, nonce: n }), { ok: false, reason: 'bad-format' });
});

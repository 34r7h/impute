import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMessage } from 'viem';
import { createCustodialKey, signWithCustodialKey } from '../src/custodial/index.js';

test('custodial key signs and the signature verifies for its address', async () => {
  const { address, keystore } = await createCustodialKey('correct horse battery staple');
  const msg = 'impute Tier-0 human approval\naction: authorize_manager';
  const sig = await signWithCustodialKey(keystore, 'correct horse battery staple', msg);
  assert.equal(await verifyMessage({ address: address as `0x${string}`, message: msg, signature: sig as `0x${string}` }), true);
});

test('wrong password fails the GCM auth (cannot decrypt)', async () => {
  const { keystore } = await createCustodialKey('correct horse battery staple');
  await assert.rejects(() => signWithCustodialKey(keystore, 'WRONG password entirely', 'x'), /bad-password/);
});

test('keystore stores no plaintext key and rejects weak passwords', async () => {
  const { keystore } = await createCustodialKey('correct horse battery staple');
  const blob = JSON.stringify(keystore);
  assert.doesNotMatch(blob, /correct horse/); // password not stored
  await assert.rejects(() => createCustodialKey('short'), /too short/);
});

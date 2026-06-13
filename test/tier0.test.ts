import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { buildApprovalMessage, verifyHumanApproval, requiresApproval, HUMAN_SCHEME, type ApprovalPayload } from '../src/tier0.js';
import { SignatureScheme } from '../src/types.js';

const NOW = 1_900_000_000;
// well-known anvil test keys standing in for "the human's Ledger" and a different signer
const human = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

test('HUMAN_SCHEME is the Tier-0 byte 0x00 (MAYO-ready)', () => {
  assert.equal(HUMAN_SCHEME, SignatureScheme.HumanMayo);
  assert.equal(HUMAN_SCHEME, 0x00);
});

test('requiresApproval gates agent spawns and over-threshold settlements only', () => {
  assert.equal(requiresApproval('spawn_agent'), true);
  assert.equal(requiresApproval('settle_above_threshold', 100, 50), true);
  assert.equal(requiresApproval('settle_above_threshold', 10, 50), false);
  assert.equal(requiresApproval('update_task'), false);
});

test('a valid clear-signed approval verifies; tamper, wrong-signer, and expiry are rejected', async () => {
  const payload: ApprovalPayload = { action: 'spawn_agent', subject: 'ff00deadbeef-agent', nonce: 'n1', exp: NOW + 300 };
  const sig = await human.signMessage({ message: buildApprovalMessage(payload) });

  assert.deepEqual(await verifyHumanApproval(payload, sig, human.address, { now: NOW + 1 }), { ok: true });
  // tampered payload -> signature no longer recovers the human
  assert.equal((await verifyHumanApproval({ ...payload, subject: 'evil-agent' }, sig, human.address, { now: NOW + 1 })).ok, false);
  // wrong expected signer
  assert.equal((await verifyHumanApproval(payload, sig, other.address, { now: NOW + 1 })).ok, false);
  // expired
  assert.deepEqual(await verifyHumanApproval(payload, sig, human.address, { now: NOW + 999 }), { ok: false, reason: 'expired' });
});

test('a settlement approval binds the amount (clear-sign shows it)', async () => {
  const payload: ApprovalPayload = { action: 'settle_above_threshold', subject: '0xpayee', amount: '5.00', nonce: 'n2', exp: NOW + 300 };
  const msg = buildApprovalMessage(payload);
  assert.match(msg, /amount: 5\.00 USDC/);
  const sig = await human.signMessage({ message: msg });
  assert.equal((await verifyHumanApproval(payload, sig, human.address, { now: NOW + 1 })).ok, true);
  // changing the amount invalidates the human's approval
  assert.equal((await verifyHumanApproval({ ...payload, amount: '500.00' }, sig, human.address, { now: NOW + 1 })).ok, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildApprovalMessage, verifyHumanApproval, requiresApproval, HUMAN_SCHEME,
  buildApprovalTypedData, verifyHumanApprovalEIP712,
  TIER0_EIP712_DOMAIN, TIER0_EIP712_PRIMARY_TYPE, TIER0_ACTIONS,
  type ApprovalPayload,
} from '../src/tier0.js';
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

// ---- EIP-712 clear-sign path (Ledger SDK) ----------------------------------------------------------

test('TIER0_ACTIONS are the agreed canonical action names', () => {
  assert.equal(TIER0_ACTIONS.SPAWN_AGENT, 'spawn_agent');
  assert.equal(TIER0_ACTIONS.CREATE_PROJECT, 'create_project');
  assert.equal(TIER0_ACTIONS.DESIGNATE_ORCHESTRATOR, 'designate_orchestrator');
  assert.equal(TIER0_ACTIONS.SET_SPENDING_LIMIT, 'set_spending_limit');
  assert.equal(TIER0_ACTIONS.SETTLE_ABOVE_THRESHOLD, 'settle_above_threshold');
});

test('buildApprovalTypedData is a stable struct; absent amount becomes empty string + exp is uint64', () => {
  const payload: ApprovalPayload = { action: 'spawn_agent', subject: 'ff00-agent', nonce: 'n1', exp: NOW + 300 };
  const td = buildApprovalTypedData(payload);
  assert.equal(td.domain.name, TIER0_EIP712_DOMAIN.name);
  assert.equal(td.primaryType, TIER0_EIP712_PRIMARY_TYPE);
  assert.equal(td.message.amount, '');                 // absent amount -> '' so the hash is deterministic
  assert.equal(td.message.exp, BigInt(NOW + 300));     // exp serialized as a bigint (uint64)
});

test('a valid EIP-712 typed-data approval verifies; tamper, wrong-signer, expiry, and EIP-191-only are rejected', async () => {
  const payload: ApprovalPayload = { action: TIER0_ACTIONS.SET_SPENDING_LIMIT, subject: 'agent-x', amount: '25.00', nonce: 'n712', exp: NOW + 300 };
  const td = buildApprovalTypedData(payload);
  // viem account signs the typed data exactly as a Ledger would (device clear-signs the same struct)
  const sig = await human.signTypedData({ domain: td.domain, types: td.types as any, primaryType: td.primaryType, message: td.message as any });

  assert.deepEqual(await verifyHumanApprovalEIP712(payload, sig, human.address, { now: NOW + 1 }), { ok: true });
  // tampered amount -> recovers a different signer
  assert.equal((await verifyHumanApprovalEIP712({ ...payload, amount: '2500.00' }, sig, human.address, { now: NOW + 1 })).ok, false);
  // tampered subject -> rejected (subject binding is enforced by the hash)
  assert.equal((await verifyHumanApprovalEIP712({ ...payload, subject: 'other-agent' }, sig, human.address, { now: NOW + 1 })).ok, false);
  // wrong expected signer
  assert.equal((await verifyHumanApprovalEIP712(payload, sig, other.address, { now: NOW + 1 })).ok, false);
  // expired
  assert.deepEqual(await verifyHumanApprovalEIP712(payload, sig, human.address, { now: NOW + 999 }), { ok: false, reason: 'expired' });
  // the two schemes are NOT interchangeable: an EIP-712 sig must not pass the EIP-191 verifier
  assert.equal((await verifyHumanApproval(payload, sig, human.address, { now: NOW + 1 })).ok, false);
});

test('an EIP-191 signature does not verify under the EIP-712 path (schemes are distinct)', async () => {
  const payload: ApprovalPayload = { action: 'spawn_agent', subject: 'agent-y', nonce: 'n191', exp: NOW + 300 };
  const sig191 = await human.signMessage({ message: buildApprovalMessage(payload) });
  assert.equal((await verifyHumanApprovalEIP712(payload, sig191, human.address, { now: NOW + 1 })).ok, false);
});

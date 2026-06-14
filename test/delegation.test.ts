import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { buildApprovalMessage } from '../src/tier0.js';
import { generateAgentKeyPair, publicIdentity } from '../src/keys.js';
import { buildManagerDelegation, buildAgentIssuance, verifyDelegationChain, type DelegationChain } from '../src/delegation/index.js';

async function chain(): Promise<DelegationChain> {
  const owner = privateKeyToAccount(generatePrivateKey());
  const manager = privateKeyToAccount(generatePrivateKey());
  const agent = publicIdentity(generateAgentKeyPair('ml-dsa-65'));
  const delegation = buildManagerDelegation(manager.address);
  const delegationSig = await owner.signMessage({ message: buildApprovalMessage(delegation) });
  const issuance = buildAgentIssuance(agent.fingerprint);
  const issuanceSig = await manager.signMessage({ message: buildApprovalMessage(issuance) });
  return { owner: owner.address, delegation, delegationSig, manager: manager.address, issuance, issuanceSig, fingerprint: agent.fingerprint };
}

test('valid owner -> manager -> ephemeral-key chain verifies', async () => {
  assert.deepEqual(await verifyDelegationChain(await chain()), { ok: true });
});

test('delegation must bind the manager the owner actually signed for', async () => {
  const c = await chain();
  c.manager = privateKeyToAccount(generatePrivateKey()).address; // swap in a manager the owner never authorized
  assert.equal((await verifyDelegationChain(c)).ok, false);
});

test('issuance must bind the actual ephemeral fingerprint', async () => {
  const c = await chain();
  c.fingerprint = 'deadbeef'.repeat(5); // not what the manager signed
  assert.equal((await verifyDelegationChain(c)).ok, false);
});

test('expired approval is rejected', async () => {
  const c = await chain();
  assert.equal((await verifyDelegationChain(c, { now: c.delegation.exp + 10 })).ok, false);
});

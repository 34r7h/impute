import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentResolver } from '../src/ens/index.js';
import type { EnsAgentMetadata } from '../src/ens/types.js';
import type { PublicClient } from 'viem';

test('ENS Agent Metadata formatting', async (t) => {
  const mockClient = {} as PublicClient;
  const resolver = new AgentResolver(mockClient);
  
  const mockMetadata: EnsAgentMetadata = {
    fingerprint: 'f1a2b3c4d5e6f7a8b9c0',
    capabilities: ['code.implement', 'crypto.sign'],
    webhookUrl: 'https://tunnel.socnet.lol/t/handoff-gemini/',
    x402Payable: true,
    erc8004TokenId: '6568'
  };

  await t.test('formats metadata into ENS text records correctly', () => {
    const records = resolver.formatRecords(mockMetadata);
    assert.equal(records['impute.fingerprint'], 'f1a2b3c4d5e6f7a8b9c0');
    assert.equal(records['impute.caps'], 'code.implement,crypto.sign');
    assert.equal(records['impute.webhook'], 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(records['impute.x402'], 'true');
    assert.equal(records['impute.erc8004'], '6568');
  });

  await t.test('resolves and parses metadata from hierarchical ENS name correctly', async () => {
    const resolverWithMock = new AgentResolver({
      getEnsText: async ({ name, key }: any) => {
        assert.equal(name, 'gemini.handoff.socnet.eth');
        if (key === 'impute.fingerprint') return 'f1a2b3c4d5e6f7a8b9c0';
        if (key === 'impute.caps') return 'code.implement, crypto.sign';
        if (key === 'impute.webhook') return 'https://tunnel.socnet.lol/t/handoff-gemini/';
        if (key === 'impute.x402') return 'true';
        if (key === 'impute.erc8004') return '6568';
        return null;
      }
    } as any);

    const resolved = await resolverWithMock.resolve('gemini.handoff.socnet.eth');
    assert.ok(resolved);
    assert.equal(resolved!.fingerprint, 'f1a2b3c4d5e6f7a8b9c0');
    assert.deepEqual(resolved!.capabilities, ['code.implement', 'crypto.sign']);
    assert.equal(resolved!.webhookUrl, 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(resolved!.x402Payable, true);
    assert.equal(resolved!.erc8004TokenId, '6568');
  });
});

test('E3 — socnet.eth subdomain PERMANENCE guard', async (t) => {
  const { AgentOnboarding } = await import('../src/ens/onboarding.js');
  const { SOCNET_PERMANENCE_WARNING } = await import('../src/ens/types.js');

  // Mock registries that should NEVER be called when permanence is not acknowledged
  const mockEnsRegistry = {
    register: async () => { throw new Error('ENS register should not be called'); },
    updateMetadata: async () => {}
  } as any;
  const mockErc8004 = {
    register: async () => { throw new Error('ERC-8004 register should not be called'); },
    getOwner: async () => null
  } as any;

  const onboarding = new AgentOnboarding(mockEnsRegistry, mockErc8004);

  const metadata = {
    fingerprint: 'e3test1234567890',
    capabilities: ['test'],
    x402Payable: false,
  } as any;

  await t.test('rejects when acknowledgedPermanence is false', async () => {
    await assert.rejects(
      () => onboarding.registerSocnetSubdomain('test-label', metadata, false),
      (err: Error) => {
        assert.ok(err.message.includes('PERMANENT'), 'Error must mention PERMANENT');
        assert.ok(err.message.includes('IRREVERSIBLE'), 'Error must mention IRREVERSIBLE');
        assert.ok(err.message.includes('CANNOT be changed'), 'Error must say CANNOT be changed');
        return true;
      }
    );
  });

  await t.test('warning text matches canonical constant', () => {
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('PERMANENT'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('IRREVERSIBLE'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('CANNOT be changed'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('CANNOT be changed, transferred, or deleted'));
  });

  await t.test('static accessor returns the canonical warning', () => {
    assert.equal(AgentOnboarding.permanenceWarning, SOCNET_PERMANENCE_WARNING);
  });
});

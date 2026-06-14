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

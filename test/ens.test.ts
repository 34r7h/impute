import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentResolver } from '../src/ens/index.js';
import type { EnsAgentMetadata } from '../src/ens/types.js';
import type { PublicClient } from 'viem';

test('ENS Agent Metadata formatting', async (t) => {
  // Mock PublicClient just enough for formatRecords
  const mockClient = {} as PublicClient;
  const resolver = new AgentResolver(mockClient);
  
  const mockMetadata: EnsAgentMetadata = {
    fingerprint: 'f1a2b3c4d5e6f7a8b9c0',
    capabilities: ['code.implement', 'crypto.sign'],
    webhookUrl: 'https://tunnel.socnet.lol/t/handoff-gemini/',
    x402Payable: true,
  };

  await t.test('formats metadata into ENS text records correctly', () => {
    const records = resolver.formatRecords(mockMetadata);
    assert.equal(records['impute.fingerprint'], 'f1a2b3c4d5e6f7a8b9c0');
    assert.equal(records['impute.caps'], 'code.implement,crypto.sign');
    assert.equal(records['impute.webhook'], 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(records['impute.x402'], 'true');
  });

  await t.test('resolves and parses metadata from ENS correctly', async () => {
    const textRecords: Record<string, string> = {
      'impute.fingerprint': 'f1a2b3c4d5e6f7a8b9c0',
      'impute.caps': 'code.implement,crypto.sign',
      'impute.webhook': 'https://tunnel.socnet.lol/t/handoff-gemini/',
      'impute.x402': 'true'
    };

    const clientWithText = {
      getEnsText: async ({ name, key }: { name: string; key: string }) => {
        assert.equal(name, 'myagent.handoff.eth');
        return textRecords[key] || null;
      }
    } as unknown as PublicClient;

    const testResolver = new AgentResolver(clientWithText);
    const meta = await testResolver.resolve('myagent.handoff.eth');
    assert.ok(meta);
    assert.equal(meta.fingerprint, 'f1a2b3c4d5e6f7a8b9c0');
    assert.deepEqual(meta.capabilities, ['code.implement', 'crypto.sign']);
    assert.equal(meta.webhookUrl, 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(meta.x402Payable, true);
  });

  await t.test('returns null if fingerprint is missing', async () => {
    const clientEmpty = {
      getEnsText: async () => null
    } as unknown as PublicClient;

    const testResolver = new AgentResolver(clientEmpty);
    const meta = await testResolver.resolve('myagent.handoff.eth');
    assert.equal(meta, null);
  });
});

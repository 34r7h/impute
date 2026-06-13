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
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReputationEngine } from '../src/erc8004/index.js';

test('ERC-8004 Reputation Engine', async (t) => {
  const engine = new ReputationEngine();

  await t.test('generates query with filter when fingerprint is provided', () => {
    const q = engine.getReputationQuery('f1a2b3c4d5e6f7a8b9c0');
    assert.match(q, /WHERE from_address = '0xf1a2b3c4d5e6f7a8b9c0'/);
    assert.match(q, /bigquery-public-data\.crypto_ethereum\.traces/);
  });

  await t.test('generates query without filter when fingerprint is omitted', () => {
    const q = engine.getReputationQuery();
    assert.doesNotMatch(q, /WHERE from_address/);
    assert.match(q, /bigquery-public-data\.crypto_ethereum\.traces/);
  });

  await t.test('rejects malformed fingerprints to prevent SQL injection', () => {
    assert.throws(() => engine.getReputationQuery('invalid-hex-chars-here'), (err: any) => err.code === 'bad-fingerprint');
    assert.throws(() => engine.getReputationQuery('f1a2b3c4d5e6f7a8b9c0\' OR 1=1;--'), (err: any) => err.code === 'bad-fingerprint');
  });
});

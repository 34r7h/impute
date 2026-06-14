import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArcSettler, ARC_CONFIG } from '../src/arc/index.js';
import type { PublicClient, WalletClient } from 'viem';

test('Arc Settlement Rail', async (t) => {
  await t.test('configures the correct network parameters', () => {
    assert.equal(ARC_CONFIG.chainId, 5042002);
    assert.equal(ARC_CONFIG.rpcUrl, 'https://rpc.testnet.arc.network');
    assert.equal(ARC_CONFIG.usdcAddress, '0x3600000000000000000000000000000000000000');
    assert.equal(ARC_CONFIG.usdcDecimals, 6);
  });

  await t.test('settle throws if wallet account is missing', async () => {
    const mockPublic = {} as PublicClient;
    const mockWallet = { account: undefined } as WalletClient;
    const settler = new ArcSettler(mockPublic, mockWallet);
    
    await assert.rejects(
      async () => await settler.settle('0x123', '10.5'),
      (err: any) => err.code === 'unauthorized'
    );
  });
});

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

  await t.test('settle correctly parses USDC decimals and initiates transfer', async () => {
    let capturedArgs: any;
    const mockPublic = {
      simulateContract: async (args: any) => {
        capturedArgs = args;
        return { request: 'mock-request' };
      }
    } as unknown as PublicClient;

    const mockWallet = { 
      account: { address: '0xabc' },
      writeContract: async () => '0xmocktxhash'
    } as unknown as WalletClient;

    const settler = new ArcSettler(mockPublic, mockWallet);
    const result = await settler.settle('0xdef', '2.5'); // 2.5 USDC

    assert.equal(result.txHash, '0xmocktxhash');
    assert.equal(capturedArgs.functionName, 'transfer');
    assert.equal(capturedArgs.args[0], '0xdef');
    // 2.5 USDC * 10^6 decimals = 2500000n
    assert.equal(capturedArgs.args[1], 2500000n);
  });
});

import { 
  parseUnits, 
  type Hash, 
  type Address,
  type PublicClient,
  type WalletClient
} from 'viem';
import { ImputeError } from '../types.js';

/** Arc Testnet (Circle) parameters. */
export const ARC_CONFIG = {
  chainId: 5042002,
  rpcUrl: 'https://rpc.testnet.arc.network',
  usdcAddress: '0x3600000000000000000000000000000000000000' as Address,
  usdcDecimals: 6,
} as const;

const erc20Abi = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

export class ArcSettler {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient
  ) {}

  /**
   * Settles a verified task payout over the Arc rail.
   * MONEY-SAFE: This only executes if explicitly called by a live controller.
   * @param to The recipient agent's wallet address.
   * @param usdcAmount The amount in USDC (decimal string).
   */
  async settle(to: string, usdcAmount: string): Promise<{ txHash: Hash }> {
    if (!this.walletClient.account) {
      throw new ImputeError('unauthorized', 'ArcSettler requires a funded wallet account');
    }

    const amountAtomic = parseUnits(usdcAmount, ARC_CONFIG.usdcDecimals);

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.walletClient.account,
        address: ARC_CONFIG.usdcAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as Address, amountAtomic],
      });

      const hash = await this.walletClient.writeContract(request);
      return { txHash: hash };
    } catch (e: any) {
      throw new ImputeError('settlement-failed', `Arc settlement failed: ${e.message}`);
    }
  }

  /**
   * Checks the treasury balance on Arc.
   */
  async getBalance(): Promise<bigint> {
    if (!this.walletClient.account) return 0n;
    return await this.publicClient.readContract({
      address: ARC_CONFIG.usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [this.walletClient.account.address],
    });
  }
}

import type { EnsAgentMetadata } from './types.js';
import { ENS_TEXT_KEYS } from './types.js';
import { type PublicClient, type WalletClient } from 'viem';
import { normalize, namehash, labelhash } from 'viem/ens';

/**
 * Interface for an ENS subname registry that automates provisioning
 * subnames under a parent domain (e.g., *.handoff.eth).
 */
export interface SubnameRegistry {
  register(label: string, metadata: EnsAgentMetadata): Promise<string>;
  updateMetadata(label: string, metadata: Partial<EnsAgentMetadata>): Promise<void>;
}

/**
 * Client for resolving agent metadata from ENS.
 */
export class AgentResolver {
  private client: PublicClient;

  constructor(client: PublicClient) {
    this.client = client;
  }

  async resolve(ensName: string): Promise<EnsAgentMetadata | null> {
    try {
      const name = normalize(ensName);
      
      const [fingerprint, capsStr, webhookUrl, x402Str] = await Promise.all([
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.FINGERPRINT }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.CAPABILITIES }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.WEBHOOK }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.X402 })
      ]);

      if (!fingerprint) return null;

      return {
        fingerprint,
        capabilities: capsStr ? capsStr.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
        webhookUrl: webhookUrl || undefined,
        x402Payable: x402Str === 'true'
      };
    } catch (e) {
      return null;
    }
  }

  formatRecords(metadata: EnsAgentMetadata): Record<string, string> {
    return {
      [ENS_TEXT_KEYS.FINGERPRINT]: metadata.fingerprint,
      [ENS_TEXT_KEYS.CAPABILITIES]: metadata.capabilities.join(','),
      [ENS_TEXT_KEYS.WEBHOOK]: metadata.webhookUrl || '',
      [ENS_TEXT_KEYS.X402]: metadata.x402Payable ? 'true' : 'false',
    };
  }
}

const resolverAbi = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const;

const registryAbi = [
  {
    name: 'setSubnodeRecord',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' }
    ],
    outputs: []
  }
] as const;

export class EnsSubnameRegistry implements SubnameRegistry {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private registryAddress: `0x${string}`,
    private resolverAddress: `0x${string}`,
    private parentName: string
  ) {}

  async register(label: string, metadata: EnsAgentMetadata): Promise<string> {
    const parentNode = namehash(normalize(this.parentName));
    const lhash = labelhash(label);
    const owner = this.walletClient.account!.address;
    
    // 1. Create subnode
    const { request: req1 } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.registryAddress,
      abi: registryAbi,
      functionName: 'setSubnodeRecord',
      args: [parentNode, lhash, owner, this.resolverAddress, 0n]
    });
    const tx1 = await this.walletClient.writeContract(req1);
    await this.publicClient.waitForTransactionReceipt({ hash: tx1 });

    // 2. Set text records
    await this.updateMetadata(`${label}.${this.parentName}`, metadata);

    return `${label}.${this.parentName}`;
  }

  async updateMetadata(ensName: string, metadata: Partial<EnsAgentMetadata>): Promise<void> {
    const node = namehash(normalize(ensName));
    const records = new AgentResolver(this.publicClient).formatRecords(metadata as EnsAgentMetadata);
    
    for (const [key, value] of Object.entries(records)) {
      if (value === undefined || value === '') continue;
      const { request } = await this.publicClient.simulateContract({
        account: this.walletClient.account!,
        address: this.resolverAddress,
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, key, value]
      });
      const hash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash });
    }
  }
}

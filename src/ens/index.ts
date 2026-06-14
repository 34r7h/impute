import type { EnsAgentMetadata } from './types.js';
import { ENS_TEXT_KEYS, SOCNET_PERMANENCE_WARNING } from './types.js';
export { SOCNET_PERMANENCE_WARNING };
import { type PublicClient, type WalletClient } from 'viem';
import { normalize, namehash, labelhash } from 'viem/ens';

export * from './onboarding.js';

/**
 * Interface for an ENS subname registry that automates provisioning
 * subnames under a parent domain in a hierarchical model:
 * <agent>.<project>.<root>
 */
export interface SubnameRegistry {
  register(label: string, parentName: string, metadata: EnsAgentMetadata): Promise<string>;
  updateMetadata(ensName: string, metadata: Partial<EnsAgentMetadata>): Promise<void>;
}

/**
 * Client for resolving agent metadata from ENS.
 */
export class AgentResolver {
  constructor(private client: PublicClient) {}

  /**
   * Fetches and parses agent metadata from ENS text records.
   * @param ensName Full ENS name to resolve.
   */
  async resolve(ensName: string): Promise<EnsAgentMetadata | null> {
    try {
      const name = normalize(ensName);
      
      const [fingerprint, capsStr, webhookUrl, x402Str, erc8004Str, reputationStr] = await Promise.all([
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.FINGERPRINT }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.CAPABILITIES }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.WEBHOOK }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.X402 }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.ERC8004 }),
        this.client.getEnsText({ name, key: ENS_TEXT_KEYS.REPUTATION })
      ]);

      if (!fingerprint) return null;

      return {
        fingerprint,
        capabilities: capsStr ? capsStr.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
        webhookUrl: webhookUrl || undefined,
        x402Payable: x402Str === 'true',
        erc8004TokenId: erc8004Str || undefined,
        reputationScore: reputationStr ? Number(reputationStr) : undefined
      };
    } catch (e) {
      return null;
    }
  }

  formatRecords(metadata: EnsAgentMetadata): Record<string, string> {
    return {
      [ENS_TEXT_KEYS.FINGERPRINT]: metadata.fingerprint,
      [ENS_TEXT_KEYS.CAPABILITIES]: (metadata.capabilities || []).join(','),
      [ENS_TEXT_KEYS.WEBHOOK]: metadata.webhookUrl || '',
      [ENS_TEXT_KEYS.X402]: metadata.x402Payable ? 'true' : 'false',
      [ENS_TEXT_KEYS.ERC8004]: metadata.erc8004TokenId || '',
      [ENS_TEXT_KEYS.REPUTATION]: metadata.reputationScore !== undefined ? String(metadata.reputationScore) : '',
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
  {
    name: 'setAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'a', type: 'address' },
    ],
    outputs: [],
  }
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
    private resolverAddress: `0x${string}`
  ) {}

  async register(label: string, parentName: string, metadata: EnsAgentMetadata): Promise<string> {
    const parentNode = namehash(normalize(parentName));
    const lhash = labelhash(label);
    const owner = this.walletClient.account!.address;
    const fullName = `${label}.${parentName}`;
    
    console.log(`Registering ${fullName}...`);
    const { request: req1 } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.registryAddress,
      abi: registryAbi,
      functionName: 'setSubnodeRecord',
      args: [parentNode, lhash, owner, this.resolverAddress, 0n]
    });
    const tx1 = await this.walletClient.writeContract(req1);
    await this.publicClient.waitForTransactionReceipt({ hash: tx1 });

    // Set Addr first
    const node = namehash(normalize(fullName));
    const { request: req2 } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.resolverAddress,
      abi: resolverAbi,
      functionName: 'setAddr',
      args: [node, owner]
    });
    await this.walletClient.writeContract(req2);

    await this.updateMetadata(fullName, metadata);

    return fullName;
  }

  async updateMetadata(ensName: string, metadata: Partial<EnsAgentMetadata>): Promise<void> {
    const node = namehash(normalize(ensName));
    const records = new AgentResolver(this.publicClient).formatRecords(metadata as EnsAgentMetadata);
    
    for (const [key, value] of Object.entries(records)) {
      if (value === undefined || value === '') continue;
      console.log(`Setting ${key} = ${value}...`);
      try {
          const { request } = await this.publicClient.simulateContract({
            account: this.walletClient.account!,
            address: this.resolverAddress,
            abi: resolverAbi,
            functionName: 'setText',
            args: [node, key, value]
          });
          const hash = await this.walletClient.writeContract(request);
          await this.publicClient.waitForTransactionReceipt({ hash });
      } catch (e: any) {
          console.warn(`Failed to set record ${key}: ${e.message}`);
      }
    }
  }
}

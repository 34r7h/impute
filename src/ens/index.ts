import type { EnsAgentMetadata } from './types.js';
import { ENS_TEXT_KEYS } from './types.js';
import { type PublicClient } from 'viem';
import { normalize } from 'viem/ens';

/**
 * Interface for an ENS subname registry that automates provisioning
 * subnames under a parent domain (e.g., *.handoff.eth).
 */
export interface SubnameRegistry {
  /**
   * Registers a new subname and sets initial text records.
   * @param label The subname label (e.g., "myagent")
   * @param metadata Initial agent metadata to publish as text records.
   * @returns The full ENS name (e.g., "myagent.handoff.eth")
   */
  register(label: string, metadata: EnsAgentMetadata): Promise<string>;

  /**
   * Updates text records for an existing subname.
   */
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

  /**
   * Fetches and parses agent metadata from ENS text records.
   * @param ensName Full ENS name to resolve.
   */
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

  /**
   * Helper to format metadata into raw text-record key-value pairs.
   */
  formatRecords(metadata: EnsAgentMetadata): Record<string, string> {
    return {
      [ENS_TEXT_KEYS.FINGERPRINT]: metadata.fingerprint,
      [ENS_TEXT_KEYS.CAPABILITIES]: metadata.capabilities.join(','),
      [ENS_TEXT_KEYS.WEBHOOK]: metadata.webhookUrl || '',
      [ENS_TEXT_KEYS.X402]: metadata.x402Payable ? 'true' : 'false',
    };
  }
}

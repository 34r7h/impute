import { ENS_TEXT_KEYS, type EnsAgentMetadata } from './types.js';

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
  /**
   * Fetches and parses agent metadata from ENS text records.
   * @param ensName Full ENS name to resolve.
   */
  async resolve(ensName: string): Promise<EnsAgentMetadata | null> {
    if (!ensName) return null;
    // TODO(B3): resolve via viem ENS text-record lookup (impute.fingerprint, impute.caps, ...).
    return null;
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

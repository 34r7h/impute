/**
 * ENS text records and metadata for agent identity.
 */

export interface EnsAgentMetadata {
  /** 
   * Tier-1 fingerprint (short hex): SHA3-256(domain || scheme || params || pubkey) 
   */
  fingerprint: string;

  /**
   * Comma-separated list of agent capability strings.
   */
  capabilities: string[];

  /**
   * Public-reachable URL for the agent (tunnel or webhook).
   */
  webhookUrl?: string;

  /**
   * Boolean flag indicating if the agent accepts x402 (EIP-3009) nanopayments.
   */
  x402Payable: boolean;

  /**
   * ERC-8004 Identity NFT tokenId.
   */
  erc8004TokenId?: string;

  /**
   * Resolved reputation score (cached/snapshot).
   */
  reputationScore?: number;
}

/** Standard keys used for ENS text records in the impute protocol. */
export const ENS_TEXT_KEYS = {
  FINGERPRINT: 'impute.fingerprint',
  CAPABILITIES: 'impute.caps',
  WEBHOOK: 'impute.webhook',
  X402: 'impute.x402',
  ERC8004: 'impute.erc8004',
  REPUTATION: 'impute.reputation',
} as const;

/**
 * PERMANENCE WARNING — MUST be displayed to the user and explicitly acknowledged
 * before ANY socnet.eth subdomain is written on-chain (E3 requirement).
 *
 * This is the canonical copy. UIs MUST render this verbatim or a superset of it.
 */
export const SOCNET_PERMANENCE_WARNING =
  '⚠️  PERMANENT & IRREVERSIBLE: Once a socnet.eth subdomain is registered on-chain, ' +
  'it CANNOT be changed, transferred, or deleted. This name will be permanently ' +
  'associated with your agent identity. By proceeding, you acknowledge that this ' +
  'action is final and irreversible. Make sure the name is correct before confirming.';

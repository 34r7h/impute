/**
 * Types for ERC-8004 registry integration and reputation scoring.
 */

export interface Erc8004Identity {
  /** Ethereum address that owns the identity. */
  owner: string;
  /** Fingerprint or other identity blob registered. */
  idBlob: string;
  /** Timestamp of registration. */
  registeredAt: number;
}

export interface ReputationScore {
  /** Agent fingerprint. */
  fingerprint: string;
  /** Aggregate score (e.g. 0-100). */
  score: number;
  /** Number of verified tasks completed. */
  verifiedTaskCount: number;
  /** Total volume of x402 payments received (in smallest units). */
  totalVolume: string;
  /** Last updated timestamp. */
  updatedAt: string;
}

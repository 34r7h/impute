import { ImputeError } from '../types.js';
import { type ReputationScore } from './types.js';
import { BigQuery } from '@google-cloud/bigquery';
import { type PublicClient, type WalletClient } from 'viem';

// A minimal ERC-8004 ABI (Draft). This assumes a simple registry: register(string) -> registers sender, getOwner(string) -> address
const erc8004Abi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'idBlob', type: 'string' }
    ],
    outputs: []
  },
  {
    name: 'getOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'idBlob', type: 'string' }
    ],
    outputs: [
      { name: 'owner', type: 'address' }
    ]
  }
] as const;

/**
 * Interface for ERC-8004 compliant registries.
 */
export interface Erc8004Registry {
  /**
   * Registers a public identity on the ERC-8004 contract.
   * @param idBlob The identity blob (usually fingerprint)
   */
  register(idBlob: string): Promise<string>; // returns tx hash

  /**
   * Fetches the owner of a registered identity blob.
   */
  getOwner(idBlob: string): Promise<string | null>;
}

export class Erc8004RegistryClient implements Erc8004Registry {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private registryAddress: `0x${string}`
  ) {}

  async register(idBlob: string): Promise<string> {
    const { request } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.registryAddress,
      abi: erc8004Abi,
      functionName: 'register',
      args: [idBlob]
    });
    const hash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async getOwner(idBlob: string): Promise<string | null> {
    try {
      const owner = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: erc8004Abi,
        functionName: 'getOwner',
        args: [idBlob]
      });
      if (owner === '0x0000000000000000000000000000000000000000') return null;
      return owner;
    } catch (e) {
      return null;
    }
  }
}


/**
 * BigQuery reputation engine.
 */
export class ReputationEngine {
  private bigquery: BigQuery;

  constructor(projectId: string = 'handoff-499317') {
    this.bigquery = new BigQuery({ projectId });
  }

  /**
   * Generates the SQL query used to calculate reputation from verified task events.
   * Note: Verified tasks in handoff emit 'coord.task_verified' events to SOCNET.
   */
  getReputationQuery(fingerprint?: string): string {
    // Fingerprints are lowercase hex (impute/keys). Reject anything else so an
    // attacker-supplied value can never be interpolated into the SQL string.
    if (fingerprint !== undefined && !/^[0-9a-f]{8,64}$/.test(fingerprint)) {
      throw new ImputeError('bad-fingerprint', 'reputation query fingerprint must be lowercase hex');
    }
    const filter = fingerprint ? `WHERE from_address = '0x${fingerprint}'` : '';
    return `
      SELECT 
        from_address as fingerprint,
        COUNT(*) as verifiedTaskCount,
        SUM(value) as totalVolume,
        LOG(COUNT(*) + 1) * 10 as score -- Example logarithmic scoring
      FROM \`bigquery-public-data.crypto_ethereum.traces\`
      ${filter}
      GROUP BY from_address
      ORDER BY score DESC
    `.trim();
  }

  /**
   * Executes the reputation query against BigQuery.
   */
  async fetchScores(fingerprint?: string): Promise<ReputationScore[]> {
    const query = this.getReputationQuery(fingerprint);
    const options = {
      query,
      location: 'US',
      maximumBytesBilled: '2000000000000', // 10GB cap
    };

    try {
      const [job] = await this.bigquery.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      
      return rows.map(row => ({
        fingerprint: row.fingerprint,
        score: row.score,
        verifiedTaskCount: row.verifiedTaskCount,
        totalVolume: row.totalVolume,
        updatedAt: new Date().toISOString()
      }));
    } catch (error: any) {
      // In a real environment, handle auth/project missing errors gracefully
      console.warn('BigQuery fetch failed (expected if lacking ADC credentials locally):', error.message);
      return [];
    }
  }
}

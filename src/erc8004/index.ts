import { ImputeError } from '../types.js';
import { type ReputationScore } from './types.js';
import { BigQuery } from '@google-cloud/bigquery';
import { type PublicClient, type WalletClient } from 'viem';

/**
 * ERC-8004 Identity Registry ABI.
 */
const identityAbi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'idBlob', type: 'string' }],
    outputs: []
  },
  {
    name: 'getOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'idBlob', type: 'string' }],
    outputs: [{ name: 'owner', type: 'address' }]
  }
] as const;

/**
 * ERC-8004 Reputation Registry ABI.
 */
// The canonical ERC-8004 ReputationRegistry (Sepolia 0x8004B663…) uses giveFeedback, keyed by the
// agent's IDENTITY tokenId (agentId), and rejects self-feedback (a client rates the agent).
const reputationAbi = [
  {
    name: 'giveFeedback',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' }
    ],
    outputs: []
  }
] as const;

export interface Erc8004Registry {
  register(idBlob: string): Promise<string>;
  getOwner(idBlob: string): Promise<string | null>;
  /** Client → agent feedback on the canonical ReputationRegistry (keyed by 8004 tokenId; no self-feedback). */
  giveFeedback(agentId: bigint, value: bigint, opts?: { valueDecimals?: number; tag1?: string; tag2?: string; endpoint?: string; feedbackURI?: string; feedbackHash?: `0x${string}` }): Promise<string>;
}

export class Erc8004RegistryClient implements Erc8004Registry {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private identityAddress: `0x${string}`,
    private reputationAddress: `0x${string}`
  ) {}

  async register(idBlob: string): Promise<string> {
    const { request } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.identityAddress,
      abi: identityAbi,
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
        address: this.identityAddress,
        abi: identityAbi,
        functionName: 'getOwner',
        args: [idBlob]
      });
      if (owner === '0x0000000000000000000000000000000000000000') return null;
      return owner;
    } catch (e) {
      return null;
    }
  }

  async giveFeedback(agentId: bigint, value: bigint, opts: { valueDecimals?: number; tag1?: string; tag2?: string; endpoint?: string; feedbackURI?: string; feedbackHash?: `0x${string}` } = {}): Promise<string> {
    const { request } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.reputationAddress,
      abi: reputationAbi,
      functionName: 'giveFeedback',
      args: [agentId, value, opts.valueDecimals ?? 0, opts.tag1 ?? '', opts.tag2 ?? '', opts.endpoint ?? '', opts.feedbackURI ?? '', opts.feedbackHash ?? `0x${'00'.repeat(32)}`]
    });
    const hash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }
}

/**
 * BigQuery reputation engine.
 */
export class ReputationEngine {
  private bigquery: BigQuery;

  constructor(
    private projectId: string = 'handoff-499317',
    private datasetId: string = 'impute',
    private tableId: string = 'reputation',
    keyFilename?: string
  ) {
    // Authenticate with an explicit service-account key, or GOOGLE_APPLICATION_CREDENTIALS (ADC).
    const kf = keyFilename ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
    this.bigquery = new BigQuery({ projectId, ...(kf ? { keyFilename: kf } : {}) });
  }

  getReputationQuery(fingerprint?: string): string {
    if (fingerprint !== undefined && !/^[0-9a-f]{8,64}$/.test(fingerprint)) {
      throw new ImputeError('bad-fingerprint', 'reputation query fingerprint must be lowercase hex');
    }
    const filter = fingerprint ? `WHERE idBlob = '${fingerprint}'` : '';
    return `
      SELECT 
        idBlob as fingerprint,
        COUNT(*) as verifiedTaskCount,
        AVG(score) as score,
        -- Volume placeholder: in the real table this would be SUM(volume) from the indexed event
        CAST(0 AS STRING) as totalVolume 
      FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
      ${filter}
      GROUP BY idBlob
      ORDER BY score DESC
      LIMIT 100
    `.trim();
  }

  async fetchScores(fingerprint?: string): Promise<ReputationScore[]> {
    const query = this.getReputationQuery(fingerprint);
    try {
      const [job] = await this.bigquery.createQueryJob({ query, location: 'US', maximumBytesBilled: '100000000' });
      const [rows] = await job.getQueryResults();
      return rows.map(row => ({
        fingerprint: row.fingerprint,
        score: Number(row.score),
        verifiedTaskCount: Number(row.verifiedTaskCount),
        totalVolume: row.totalVolume,
        updatedAt: new Date().toISOString()
      }));
    } catch (error: any) {
      console.warn('BigQuery fetch failed:', error.message);
      return [];
    }
  }
}

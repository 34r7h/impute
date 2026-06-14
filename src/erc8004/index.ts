import { ImputeError } from '../types.js';
import { type ReputationScore } from './types.js';
import { BigQuery } from '@google-cloud/bigquery';
import { type PublicClient, type WalletClient, type Address } from 'viem';

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
 * ERC-8004 Reputation Registry ABI (Corrected for giveFeedback).
 */
export const REPUTATION_ABI = [
  {
    name: 'giveFeedback',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    type: 'event',
    name: 'FeedbackGiven',
    inputs: [
      { name: 'author', type: 'address', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'value', type: 'int128', indexed: false },
      { name: 'tag1', type: 'bytes32', indexed: true }
    ]
  }
] as const;

export interface Erc8004Registry {
  register(idBlob: string): Promise<string>;
  getOwner(idBlob: string): Promise<string | null>;
  giveFeedback(agentId: bigint, score: number, commentURI: string): Promise<string>;
}

export class Erc8004RegistryClient implements Erc8004Registry {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private identityAddress: Address,
    private reputationAddress: Address
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

  async giveFeedback(agentId: bigint, score: number, commentURI: string): Promise<string> {
    const { request } = await this.publicClient.simulateContract({
      account: this.walletClient.account!,
      address: this.reputationAddress,
      abi: REPUTATION_ABI,
      functionName: 'giveFeedback',
      args: [
        agentId,
        BigInt(score),
        0,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        '',
        commentURI,
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ]
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
    private tableId: string = 'reputation'
  ) {
    this.bigquery = new BigQuery({ projectId });
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

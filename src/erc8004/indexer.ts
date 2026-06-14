import { BigQuery } from '@google-cloud/bigquery';
import { type PublicClient, type Address, decodeEventLog } from 'viem';
import { REPUTATION_ABI } from './index.js';

/**
 * Indexes ReputationRegistry events from Ethereum into BigQuery.
 */
export class ReputationIndexer {
  private bigquery: BigQuery;

  constructor(
    private publicClient: PublicClient,
    private reputationAddress: Address,
    projectId: string = 'handoff-499317',
    private datasetId: string = 'impute',
    private tableId: string = 'reputation'
  ) {
    this.bigquery = new BigQuery({ projectId });
  }

  /**
   * Fetches FeedbackGiven events from a block range and inserts them into BigQuery.
   * @param fromBlock The start block (inclusive).
   * @param toBlock The end block (inclusive).
   */
  async indexRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
    const logs = await this.publicClient.getLogs({
      address: this.reputationAddress,
      event: REPUTATION_ABI[1] as any, // FeedbackGiven
      fromBlock,
      toBlock
    });

    if (logs.length === 0) return 0;

    const rows = logs.map(log => {
      const { args } = decodeEventLog({
        abi: REPUTATION_ABI,
        data: log.data,
        topics: log.topics
      }) as any;

      return {
        author: args.author,
        idBlob: args.agentId.toString(), // The 8004 identity tokenId
        score: Number(args.value),
        tx_hash: log.transactionHash,
        block_number: Number(log.blockNumber),
        timestamp: new Date().toISOString() // In a real indexer, fetch block timestamp
      };
    });

    await this.bigquery
      .dataset(this.datasetId)
      .table(this.tableId)
      .insert(rows);

    return rows.length;
  }
}

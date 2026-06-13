/**
 * Circle W3S (Programmable Wallets) types — the Tier-1.5 settlement rail.
 *
 * impute agents earn USDC for verified work. Circle's developer-controlled
 * wallets let the swarm hold and move that USDC programmatically: each agent
 * gets a Circle wallet, and a verified task triggers a real on-chain USDC
 * transfer between agents. This is the Arc/Circle sponsor integration — the
 * client lives here in impute (reusable), the broker wiring lives in handoff.
 */

/** Config for {@link CircleW3SClient}. */
export interface CircleW3SConfig {
  /** Full Circle key in `ENV:ID:SECRET` form (e.g. `TEST_API_KEY:...:...`). */
  apiKey: string;
  /** API base. Defaults to `https://api.circle.com` (testnet keys hit the same host). */
  baseUrl?: string;
  /**
   * 32-byte hex entity secret. Required for any developer-controlled wallet
   * operation (wallet-set/wallet creation, transfers). Generate once with
   * {@link generateEntitySecret}, register its ciphertext once per Circle
   * account, then keep it secret (env, never git).
   */
  entitySecret?: string;
}

/** A Circle developer-controlled wallet. */
export interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
  state: string;
  walletSetId: string;
  accountType?: string;
}

/** A token balance held by a wallet. */
export interface CircleTokenBalance {
  tokenId: string;
  symbol: string;
  amount: string;
  tokenAddress?: string;
  blockchain?: string;
}

/** Result of a transfer — poll {@link CircleW3SClient.getTransaction} until `txHash` lands. */
export interface CircleTransferResult {
  id: string;
  /** INITIATED | QUEUED | SENT | CONFIRMED | COMPLETE | FAILED | CANCELLED | … */
  state: string;
  txHash?: string;
}

import { type CircleW3SConfig, type CircleWallet, type CircleTokenBalance, type CircleTransferResult } from './types.js';
import { publicEncrypt, randomBytes, randomUUID, constants } from 'node:crypto';

const DEFAULT_BASE = 'https://api.circle.com';

/** Error from the Circle API (carries the Circle error `code` and HTTP `status`). */
export class CircleError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'CircleError';
  }
}

/** Generate a fresh 32-byte entity secret (hex). Register its ciphertext once, then keep it secret. */
export function generateEntitySecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Minimal client for Circle's W3S (Programmable Wallets) developer-controlled
 * wallet API — enough to create agent wallets and settle a verified task in
 * USDC on a testnet. No SDK dependency: uses `fetch` + `node:crypto` only.
 *
 * The fiddly part of W3S is the **entity secret**: every state-changing
 * developer call must carry a *fresh* RSA-OAEP ciphertext of your 32-byte
 * entity secret (Circle rejects a reused ciphertext). {@link freshCiphertext}
 * mints one per call; never cache it.
 */
export class CircleW3SClient {
  private apiKey: string;
  private baseUrl: string;
  private entitySecret?: string;
  private publicKeyPem?: string;

  constructor(cfg: CircleW3SConfig) {
    if (!cfg.apiKey) throw new CircleError('no-key', 'apiKey is required');
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    this.entitySecret = cfg.entitySecret;
  }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(this.baseUrl + path, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!r.ok) throw new CircleError(String(json.code ?? r.status), json.message ?? `HTTP ${r.status}`, r.status);
    return json;
  }

  /** Circle's RSA public key for entity-secret encryption (cached after first fetch). */
  async getPublicKey(): Promise<string> {
    if (this.publicKeyPem) return this.publicKeyPem;
    const j = await this.req('GET', '/v1/w3s/config/entity/publicKey');
    this.publicKeyPem = j.data.publicKey as string;
    return this.publicKeyPem;
  }

  /**
   * RSA-OAEP-SHA256-encrypt the entity secret with Circle's public key → base64.
   * OAEP randomizes every output, so each call yields a *fresh* ciphertext — which
   * is exactly what Circle's developer endpoints require (a reused one is rejected).
   */
  async freshCiphertext(): Promise<string> {
    if (!this.entitySecret) {
      throw new CircleError('no-entity-secret', 'entitySecret is required for developer-controlled wallet operations');
    }
    const pem = await this.getPublicKey();
    return publicEncrypt(
      { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(this.entitySecret, 'hex'),
    ).toString('base64');
  }

  /** One-time per Circle account: register the entity-secret ciphertext. Returns the recovery-file blob (store it). */
  async registerEntitySecret(): Promise<{ recoveryFile: string }> {
    const j = await this.req('POST', '/v1/w3s/config/entity/entitySecret/ciphertext', {
      entitySecretCiphertext: await this.freshCiphertext(),
    });
    return { recoveryFile: j.data?.recoveryFile ?? '' };
  }

  /** Create a wallet set (a key-managed grouping of wallets). */
  async createWalletSet(name: string): Promise<{ id: string; name: string }> {
    const j = await this.req('POST', '/v1/w3s/developer/walletSets', {
      idempotencyKey: randomUUID(),
      entitySecretCiphertext: await this.freshCiphertext(),
      name,
    });
    return j.data.walletSet;
  }

  /** Create `count` wallets on the given blockchains (e.g. `['ETH-SEPOLIA']`). */
  async createWallets(walletSetId: string, blockchains: string[], count = 1, accountType: 'EOA' | 'SCA' = 'EOA'): Promise<CircleWallet[]> {
    const j = await this.req('POST', '/v1/w3s/developer/wallets', {
      idempotencyKey: randomUUID(),
      entitySecretCiphertext: await this.freshCiphertext(),
      walletSetId,
      blockchains,
      count,
      accountType,
    });
    return j.data.wallets;
  }

  /** Token balances for a wallet (use the returned `tokenId` to transfer that token). */
  async getBalances(walletId: string): Promise<CircleTokenBalance[]> {
    const j = await this.req('GET', `/v1/w3s/wallets/${walletId}/balances`);
    return (j.data?.tokenBalances ?? []).map((b: any) => ({
      tokenId: b.token.id,
      symbol: b.token.symbol,
      amount: b.amount,
      tokenAddress: b.token.tokenAddress,
      blockchain: b.token.blockchain,
    }));
  }

  /** Fund a wallet from Circle's testnet faucet (USDC + native gas). Testnet only — no-op on mainnet keys. */
  async faucetDrip(address: string, blockchain: string): Promise<void> {
    await this.req('POST', '/v1/faucet/drips', { address, blockchain, native: true, usdc: true });
  }

  /** Send `amount` (decimal, e.g. "0.01") of the token `tokenId` from `walletId` to `destinationAddress`. */
  async transfer(opts: { walletId: string; destinationAddress: string; tokenId: string; amount: string }): Promise<CircleTransferResult> {
    const j = await this.req('POST', '/v1/w3s/developer/transactions/transfer', {
      idempotencyKey: randomUUID(),
      entitySecretCiphertext: await this.freshCiphertext(),
      walletId: opts.walletId,
      destinationAddress: opts.destinationAddress,
      tokenId: opts.tokenId,
      amounts: [opts.amount],
      feeLevel: 'MEDIUM',
    });
    return { id: j.data.id, state: j.data.state };
  }

  /** Current state + txHash of a transaction. */
  async getTransaction(id: string): Promise<CircleTransferResult> {
    const j = await this.req('GET', `/v1/w3s/transactions/${id}`);
    const t = j.data.transaction;
    return { id: t.id, state: t.state, txHash: t.txHash };
  }

  /** Poll a transaction until it has a `txHash` or reaches a terminal state. */
  async waitForTx(id: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<CircleTransferResult> {
    const timeoutMs = opts.timeoutMs ?? 90_000;
    const intervalMs = opts.intervalMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;
    let last: CircleTransferResult = { id, state: 'UNKNOWN' };
    while (Date.now() < deadline) {
      last = await this.getTransaction(id);
      if (last.txHash || ['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED'].includes(last.state)) return last;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return last;
  }
}

export { type CircleW3SConfig, type CircleWallet, type CircleTokenBalance, type CircleTransferResult } from './types.js';

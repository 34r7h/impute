/**
 * Tier-0 — Human authority (Ledger clear-sign).
 *
 * The root of the delegation chain: a human authorizes high-risk actions (spawning an
 * agent, settling above a threshold) by CLEAR-SIGNING an approval on a hardware wallet.
 * The signing happens on the device; this module VERIFIES the approval — the signature
 * must recover the authorized human address over the exact clear-signed message, within
 * its validity window. `signature_scheme` 0x00 (HumanMayo): ECDSA/secp256k1 today,
 * MAYO-ready behind the scheme byte the moment certified hardware exists (SPEC §6).
 */

import { verifyMessage, verifyTypedData } from 'viem';
import { SignatureScheme, type Hex, type VerifyResult } from './types.js';

/** The Tier-0 human scheme byte. ECDSA (Ledger clear-sign) today; MAYO when certified HW exists. */
export const HUMAN_SCHEME = SignatureScheme.HumanMayo;

/**
 * The canonical high-risk action names a host may put behind a Tier-0 human approval. Open by design
 * (`ApprovalPayload.action` is a free string — hosts define their own), but these are the ones impute and
 * the handoff broker agree on, exported so the signer (client) and the verifier (broker) can't typo them
 * apart. The 0x00 scheme byte is the trust tier; these strings are the intent the human clear-signs.
 */
export const TIER0_ACTIONS = Object.freeze({
  /** Spawn / register a new agent. */
  SPAWN_AGENT: 'spawn_agent',
  /** Settle a payout above the configured threshold. */
  SETTLE_ABOVE_THRESHOLD: 'settle_above_threshold',
  /** Create a new project (request). */
  CREATE_PROJECT: 'create_project',
  /** Designate an agent as a project orchestrator. */
  DESIGNATE_ORCHESTRATOR: 'designate_orchestrator',
  /** Set a per-agent spending cap. */
  SET_SPENDING_LIMIT: 'set_spending_limit',
} as const);
export type Tier0Action = (typeof TIER0_ACTIONS)[keyof typeof TIER0_ACTIONS];

/** A high-risk action that requires human (Tier-0) approval. */
export interface ApprovalPayload {
  /** e.g. 'spawn_agent' | 'settle_above_threshold' (open string — hosts define their own). */
  action: string;
  /** What is being approved — an agent fingerprint to spawn, a payout target, etc. */
  subject: string;
  /** Optional amount (USDC decimal string) for settlement approvals. */
  amount?: string;
  /** Unique nonce (anti-replay). */
  nonce: string;
  /** Expiry (unix seconds). */
  exp: number;
}

/**
 * The exact human-readable message the human clear-signs on the device. Deterministic and
 * LEGIBLE on purpose — clear-signing means the human sees precisely what they authorize,
 * which is the whole point of a hardware root of intent.
 */
export function buildApprovalMessage(p: ApprovalPayload): string {
  return [
    'impute Tier-0 human approval',
    `action: ${p.action}`,
    `subject: ${p.subject}`,
    ...(p.amount !== undefined ? [`amount: ${p.amount} USDC`] : []),
    `nonce: ${p.nonce}`,
    `expires: ${p.exp}`,
  ].join('\n');
}

/**
 * The gate: which actions/amounts require Tier-0 human approval. Agent spawns always do;
 * settlements do once they exceed `thresholdUsdc`. Everything else flows autonomously.
 */
export function requiresApproval(action: string, amountUsdc?: number, thresholdUsdc = 0): boolean {
  if (action === 'spawn_agent') return true;
  if (amountUsdc !== undefined && amountUsdc > thresholdUsdc) return true;
  return false;
}

/**
 * Verify a human's Tier-0 approval. The signature must recover `humanAddress` over the
 * canonical clear-signed message, and the approval must be within its window. Returns an
 * explicit `{ ok, reason }` and never throws on a malformed signature.
 */
export async function verifyHumanApproval(
  payload: ApprovalPayload,
  signature: Hex,
  humanAddress: Hex,
  opts: { now?: number } = {},
): Promise<VerifyResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return { ok: false, reason: 'expired' };
  try {
    const ok = await verifyMessage({
      address: humanAddress as `0x${string}`,
      message: buildApprovalMessage(payload),
      signature: signature as `0x${string}`,
    });
    return ok ? { ok: true } : { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
}

// ---- EIP-712 clear-signing path (Ledger SDK) --------------------------------------------------------
// The SAME ApprovalPayload, signed as EIP-712 typed data instead of an EIP-191 personal_sign string.
// A Ledger signs this with `signEIP712Message` / `signEIP712HashedMessage` (@ledgerhq/hw-app-eth) and the
// device CLEAR-SIGNS the struct field-by-field (action / subject / amount / nonce / expires). This module
// is the SINGLE SOURCE OF TRUTH for the domain + struct: both the on-device signer and this verifier import
// it, so the typed data can never drift between signing and verification.

/** The EIP-712 domain for Tier-0 human approvals. Chainless + addressless on purpose: the approval is an
 *  off-chain authorization of a broker action, not an on-chain transaction, so it binds to no contract and
 *  no chain. `name` + `version` are what the Ledger shows as the domain and what the verifier pins. */
export const TIER0_EIP712_DOMAIN = Object.freeze({
  name: 'impute Tier-0 human approval',
  version: '1',
} as const);

/** The EIP-712 `types` for the ApprovalPayload struct. `amount` is a string so an absent amount and an
 *  amount of "0" stay distinguishable on the wire and on the device display (clear-sign legibility). */
export const TIER0_EIP712_TYPES = Object.freeze({
  Approval: [
    { name: 'action', type: 'string' },
    { name: 'subject', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'exp', type: 'uint64' },
  ],
} as const);

/** The primary type signed (matches a key in `TIER0_EIP712_TYPES`). */
export const TIER0_EIP712_PRIMARY_TYPE = 'Approval' as const;

/**
 * The exact EIP-712 typed-data object a human clear-signs on the device for `payload`. Deterministic:
 * `amount` defaults to '' when absent so the message hash is stable across signer and verifier. Feed the
 * returned object straight to viem's `signTypedData` / a Ledger's `signEIP712Message`.
 */
export function buildApprovalTypedData(payload: ApprovalPayload) {
  return {
    domain: TIER0_EIP712_DOMAIN,
    types: TIER0_EIP712_TYPES,
    primaryType: TIER0_EIP712_PRIMARY_TYPE,
    message: {
      action: payload.action,
      subject: payload.subject,
      amount: payload.amount ?? '',
      nonce: payload.nonce,
      exp: BigInt(payload.exp),
    },
  } as const;
}

/**
 * Verify a human's Tier-0 approval signed as EIP-712 typed data (the Ledger clear-sign path). The
 * signature must recover `humanAddress` over the canonical Approval typed data, and the approval must be
 * within its window. Same `{ ok, reason }` contract as `verifyHumanApproval`; never throws.
 */
export async function verifyHumanApprovalEIP712(
  payload: ApprovalPayload,
  signature: Hex,
  humanAddress: Hex,
  opts: { now?: number } = {},
): Promise<VerifyResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return { ok: false, reason: 'expired' };
  try {
    const td = buildApprovalTypedData(payload);
    const ok = await verifyTypedData({
      address: humanAddress as `0x${string}`,
      domain: td.domain,
      types: td.types as any,
      primaryType: td.primaryType,
      message: td.message as any,
      signature: signature as `0x${string}`,
    });
    return ok ? { ok: true } : { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
}

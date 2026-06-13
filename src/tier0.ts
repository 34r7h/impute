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

import { verifyMessage } from 'viem';
import { SignatureScheme, type Hex, type VerifyResult } from './types.js';

/** The Tier-0 human scheme byte. ECDSA (Ledger clear-sign) today; MAYO when certified HW exists. */
export const HUMAN_SCHEME = SignatureScheme.HumanMayo;

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

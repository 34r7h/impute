/**
 * Delegation — Tier-0 → manager → ephemeral agent key.
 *
 * The accountability spine: a human OWNER (Ledger or hot key) clear-signs to authorize a
 * project MANAGER (a distinct keyholder); the manager then issues + signs EPHEMERAL agent keys,
 * each binding to the specific ML-DSA fingerprint. Every agent key therefore roots to a human
 * signature — zero-standing-privilege done right (the key is ephemeral AND provably authorized).
 *
 * The construction is temporal-safe: the manager signs the issuance AFTER the key exists, so the
 * signature commits to the real fingerprint (a signature made before keygen authorizes nothing).
 */
import { verifyHumanApproval, type ApprovalPayload } from '../tier0.js';
import { type Hex, type VerifyResult } from '../types.js';

/** Tier-0 action: owner authorizes a manager keyholder to issue agent keys. */
export const DELEGATE_MANAGER = 'authorize_manager';
/** Manager action: authorize a specific ephemeral agent key (subject = ML-DSA fingerprint). */
export const ISSUE_AGENT_KEY = 'authorize_agent_key';

function randNonce(): string {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Build the owner's `authorize_manager` payload — the owner signs `buildApprovalMessage(this)`. */
export function buildManagerDelegation(managerAddress: Hex, opts: { ttlSeconds?: number; nonce?: string; now?: number } = {}): ApprovalPayload {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  return { action: DELEGATE_MANAGER, subject: managerAddress.toLowerCase(), nonce: opts.nonce ?? randNonce(), exp: now + (opts.ttlSeconds ?? 600) };
}

/** Build the manager's `authorize_agent_key` payload — sign AFTER keygen so it binds the fingerprint. */
export function buildAgentIssuance(fingerprint: string, opts: { ttlSeconds?: number; nonce?: string; now?: number } = {}): ApprovalPayload {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  return { action: ISSUE_AGENT_KEY, subject: fingerprint, nonce: opts.nonce ?? randNonce(), exp: now + (opts.ttlSeconds ?? 600) };
}

/** A complete owner → manager → ephemeral-key delegation, with both signatures. */
export interface DelegationChain {
  owner: Hex;
  delegation: ApprovalPayload;
  delegationSig: Hex;
  manager: Hex;
  issuance: ApprovalPayload;
  issuanceSig: Hex;
  fingerprint: string;
}

/**
 * Verify the full chain: the owner's signature binds the manager, the manager's signature binds
 * THIS fingerprint, and both approvals are in-window. Returns `{ ok }` and never throws.
 * If `{ ok: true }`, the ephemeral key `fingerprint` is cryptographically rooted in `owner`.
 */
export async function verifyDelegationChain(c: DelegationChain, opts: { now?: number } = {}): Promise<VerifyResult> {
  if (c.delegation.action !== DELEGATE_MANAGER) return { ok: false, reason: 'bad-delegation-action' };
  if (c.delegation.subject.toLowerCase() !== c.manager.toLowerCase()) return { ok: false, reason: 'delegation-subject-mismatch' };
  const dv = await verifyHumanApproval(c.delegation, c.delegationSig, c.owner, opts);
  if (!dv.ok) return { ok: false, reason: `owner-${dv.reason}` };
  if (c.issuance.action !== ISSUE_AGENT_KEY) return { ok: false, reason: 'bad-issuance-action' };
  if (c.issuance.subject !== c.fingerprint) return { ok: false, reason: 'issuance-subject-mismatch' };
  const iv = await verifyHumanApproval(c.issuance, c.issuanceSig, c.manager, opts);
  if (!iv.ok) return { ok: false, reason: `manager-${iv.reason}` };
  return { ok: true };
}

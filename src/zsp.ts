/**
 * Tier-2 capability — Zero-Standing-Privilege (ZSP) tokens.
 *
 * A ZSP token grants a narrow, time-boxed capability: scoped to specific actions,
 * bound to a single Tier-1 agent, signed by that agent's ML-DSA key, and dead the
 * moment it expires or is burned. Mint on task claim; burn on verify or expiry.
 * After `exp` there is no standing privilege to revoke later — it is simply gone.
 *
 * The host wires this into its own task lifecycle through {@link createCapabilityManager}'s
 * hooks: handoff maps `update_task{in_progress}` -> mint and `verify_task`/TTL -> burn.
 */

import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { sign, verifyAgent, fingerprint } from './keys.js';
import {
  AGENT_SCHEMES,
  SignatureScheme,
  ImputeError,
  type MlDsaParams,
  type AgentKeyPair,
  type ZspToken,
  type SignedZspToken,
  type VerifyResult,
} from './types.js';

/** Reverse of SCHEME_FOR_PARAMS: which ML-DSA parameter set a Tier-1 scheme byte denotes. */
const PARAMS_FOR_SCHEME: Partial<Record<SignatureScheme, MlDsaParams>> = {
  [SignatureScheme.AgentMlDsa44]: 'ml-dsa-44',
  [SignatureScheme.AgentMlDsa65]: 'ml-dsa-65',
  [SignatureScheme.AgentMlDsa87]: 'ml-dsa-87',
};

/** Domain-separation context so a ZSP signature can never be replayed as another agent signature. */
const ZSP_CONTEXT = new TextEncoder().encode('impute/zsp/v1');

/**
 * Deterministic, sorted-key JSON encoding. Signer and verifier reconstruct the
 * exact same bytes regardless of property insertion order, so the signature is
 * over a canonical form. (Generalized into the `wire` codec in A4.)
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/** The exact bytes that get signed for a ZSP token. */
export function canonicalTokenBytes(token: ZspToken): Uint8Array {
  return new TextEncoder().encode(canonicalize(token));
}

/** Parameters for minting a capability. */
export interface MintParams {
  /** The host/resource the capability is for (e.g. a handoff request id). */
  aud: string;
  /** Allowed actions — least privilege. An empty array grants nothing. */
  scope: string[];
  /** Lifetime in seconds from `nbf`. Must be > 0 — there are no immortal tokens. */
  ttlSeconds: number;
  /** Not-before (unix seconds); defaults to now. */
  nbf?: number;
}

/** Mint a ZSP token: builds it, signs the canonical bytes with the Tier-1 key, returns the signed bundle. */
export function mintZspToken(kp: AgentKeyPair, p: MintParams): SignedZspToken {
  if (!AGENT_SCHEMES.has(kp.scheme)) {
    throw new ImputeError('bad-scheme', 'a ZSP token must be signed by a Tier-1 agent key');
  }
  if (!(p.ttlSeconds > 0)) {
    throw new ImputeError('bad-ttl', 'ttlSeconds must be > 0 — ZSP tokens are never immortal');
  }
  const nbf = p.nbf ?? Math.floor(Date.now() / 1000);
  const token: ZspToken = {
    v: 1,
    jti: bytesToHex(randomBytes(16)),
    sub: fingerprint(kp.params, kp.publicKey),
    aud: p.aud,
    scope: [...p.scope],
    nbf,
    exp: nbf + Math.floor(p.ttlSeconds),
    scheme: kp.scheme,
  };
  const sig = sign(kp, canonicalTokenBytes(token), { context: ZSP_CONTEXT });
  return { token, sig: bytesToHex(sig), pub: bytesToHex(kp.publicKey) };
}

/** What to check a presented token against. */
export interface ZspCheck {
  /** Require this action to be in the token's scope. */
  action?: string;
  /** Require the token's audience to equal this. */
  aud?: string;
  /** Override "now" (unix seconds) — for testing / deterministic verification. */
  now?: number;
  /** Return true if a jti has been revoked/burned. */
  isRevoked?: (jti: string) => boolean;
}

/**
 * Verify a presented ZSP token. Checks, in order: signature over the canonical
 * bytes → scheme is a Tier-1 agent scheme → subject binds to the signer's key →
 * inside [nbf, exp) → audience → action in scope → not revoked. Returns an
 * explicit `{ ok, reason }`; the first failing check sets the reason.
 */
export function verifyZspToken(signed: SignedZspToken, check: ZspCheck = {}): VerifyResult {
  const { token, sig, pub } = signed ?? ({} as SignedZspToken);
  if (!token || token.v !== 1) return { ok: false, reason: 'bad-token' };
  const params = PARAMS_FOR_SCHEME[token.scheme];
  if (!params || !AGENT_SCHEMES.has(token.scheme)) return { ok: false, reason: 'bad-scheme' };

  let pubBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubBytes = hexToBytes(pub);
    sigBytes = hexToBytes(sig);
  } catch {
    return { ok: false, reason: 'bad-encoding' };
  }

  const v = verifyAgent({ params, publicKey: pubBytes }, canonicalTokenBytes(token), sigBytes, { context: ZSP_CONTEXT });
  if (!v.ok) return { ok: false, reason: 'bad-signature' };

  // The token's subject must be the signer's own fingerprint (binds capability to identity).
  if (token.sub !== fingerprint(params, pubBytes)) return { ok: false, reason: 'subject-mismatch' };

  const now = check.now ?? Math.floor(Date.now() / 1000);
  if (now < token.nbf) return { ok: false, reason: 'not-yet-valid' };
  if (now >= token.exp) return { ok: false, reason: 'expired' };

  if (check.aud !== undefined && check.aud !== token.aud) return { ok: false, reason: 'wrong-audience' };
  if (check.action !== undefined && !token.scope.includes(check.action)) return { ok: false, reason: 'out-of-scope' };
  if (check.isRevoked?.(token.jti)) return { ok: false, reason: 'revoked' };

  return { ok: true };
}

/** Why a token was burned. */
export type BurnReason = 'verified' | 'expired' | 'revoked';

/** Lifecycle hooks a host app wires into its own task lifecycle. */
export interface ZspHooks {
  onMint?(token: ZspToken): void;
  onBurn?(jti: string, reason: BurnReason): void;
}

/** A small stateful manager: mints, tracks revocations, burns, and verifies against its own revoke set. */
export interface CapabilityManager {
  mint(kp: AgentKeyPair, p: MintParams): SignedZspToken;
  verify(signed: SignedZspToken, check?: Omit<ZspCheck, 'isRevoked'>): VerifyResult;
  burn(jti: string, reason: Exclude<BurnReason, 'expired'>): void;
  isRevoked(jti: string): boolean;
}

/**
 * Create a capability manager with optional lifecycle hooks. This is the adapter
 * surface for a host: call `mint` on task claim, `burn(jti,'verified')` on verify,
 * and `verify` enforces scope/TTL/revocation automatically.
 */
export function createCapabilityManager(hooks: ZspHooks = {}): CapabilityManager {
  const revoked = new Set<string>();
  return {
    mint(kp, p) {
      const signed = mintZspToken(kp, p);
      hooks.onMint?.(signed.token);
      return signed;
    },
    verify(signed, check = {}) {
      return verifyZspToken(signed, { ...check, isRevoked: (jti) => revoked.has(jti) });
    },
    burn(jti, reason) {
      if (!revoked.has(jti)) {
        revoked.add(jti);
        hooks.onBurn?.(jti, reason);
      }
    },
    isRevoked(jti) {
      return revoked.has(jti);
    },
  };
}

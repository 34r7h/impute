/**
 * Tier-1 agent identity — ML-DSA (FIPS-204) keys.
 *
 * Each agent holds a post-quantum ML-DSA keypair. Keygen is deterministic from a
 * 32-byte seed, signing/verification use the standard (external) ML-DSA interface
 * with an optional domain-separation context. The stable agent id is a 160-bit
 * fingerprint over the public key, bound to its scheme + parameter set.
 */

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { randomBytes } from '@noble/post-quantum/utils.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import {
  SCHEME_FOR_PARAMS,
  ImputeError,
  type MlDsaParams,
  type AgentKeyPair,
  type AgentPublicIdentity,
  type VerifyResult,
} from './types.js';

/** The FIPS-204 ML-DSA implementations, by parameter set. */
const ALGOS = {
  'ml-dsa-44': ml_dsa44,
  'ml-dsa-65': ml_dsa65,
  'ml-dsa-87': ml_dsa87,
} as const;

/** ML-DSA keygen seed length (FIPS-204 ξ). */
export const SEED_BYTES = 32;

/** Domain separator so an agent fingerprint can't collide with any other hash impute computes. */
const FP_DOMAIN = new TextEncoder().encode('impute/agent-fingerprint/v1');

/** Options for sign/verify — a FIPS-204 domain-separation `context` (≤255 bytes). */
export interface SignOptions {
  context?: Uint8Array;
}

function ctxOpts(o?: SignOptions): { context?: Uint8Array } {
  return o?.context ? { context: o.context } : {};
}

/**
 * Generate a Tier-1 agent keypair. Deterministic from a 32-byte `seed` (the same
 * seed always reproduces the same key — this is what FIPS-204 keyGen KATs check);
 * omit `seed` for a fresh random identity.
 *
 * The returned `secretKey` is sensitive: never log it, never put it on the wire.
 */
export function generateAgentKeyPair(params: MlDsaParams = 'ml-dsa-65', seed?: Uint8Array): AgentKeyPair {
  const s = seed ?? randomBytes(SEED_BYTES);
  if (s.length !== SEED_BYTES) {
    throw new ImputeError('bad-seed', `ML-DSA keygen seed must be ${SEED_BYTES} bytes, got ${s.length}`);
  }
  const { publicKey, secretKey } = ALGOS[params].keygen(s);
  return { params, scheme: SCHEME_FOR_PARAMS[params], publicKey, secretKey };
}

/**
 * The stable, short agent id: first 20 bytes (160 bits) of
 * `SHA3-256(domain || schemeByte || params || publicKey)`, hex-encoded. Binding
 * the scheme + parameter set means two schemes over the same key bytes can never
 * share a fingerprint.
 */
export function fingerprint(params: MlDsaParams, publicKey: Uint8Array): string {
  const scheme = SCHEME_FOR_PARAMS[params];
  const buf = concatBytes(FP_DOMAIN, Uint8Array.of(scheme), new TextEncoder().encode(params), publicKey);
  return bytesToHex(sha3_256(buf).subarray(0, 20));
}

/** Derive the public identity (safe to publish to ENS / ERC-8004) from a key or (params, publicKey). */
export function publicIdentity(kp: { params: MlDsaParams; publicKey: Uint8Array }): AgentPublicIdentity {
  return {
    params: kp.params,
    scheme: SCHEME_FOR_PARAMS[kp.params],
    publicKey: kp.publicKey,
    fingerprint: fingerprint(kp.params, kp.publicKey),
  };
}

/** Sign a message with a Tier-1 agent key (FIPS-204 ML-DSA, optional context). */
export function sign(kp: AgentKeyPair, message: Uint8Array, opts?: SignOptions): Uint8Array {
  return ALGOS[kp.params].sign(message, kp.secretKey, ctxOpts(opts));
}

/**
 * Verify an agent signature. Returns an explicit `{ ok, reason }` and never
 * throws on bad input — a malformed or wrong signature is `{ ok:false }`, not an
 * exception, so a verifier can't be DoS'd by a crafted blob.
 */
export function verifyAgent(
  id: { params: MlDsaParams; publicKey: Uint8Array },
  message: Uint8Array,
  signature: Uint8Array,
  opts?: SignOptions,
): VerifyResult {
  let ok = false;
  try {
    ok = ALGOS[id.params].verify(signature, message, id.publicKey, ctxOpts(opts));
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  return ok ? { ok: true } : { ok: false, reason: 'bad-signature' };
}

/**
 * Wire format — the `signature_scheme` byte and the canonical codec (SPEC §5).
 *
 * Anything that gets signed (ZSP tokens, attestation quote bodies) is encoded with
 * a deterministic, sorted-key serialization so the signer and verifier agree on the
 * exact bytes. Signatures on the wire are prefixed with a one-byte `signature_scheme`
 * so a verifier knows which algorithm + trust tier produced them.
 */

import { SignatureScheme, ImputeError } from './types.js';

/** Deterministic, sorted-key JSON encoding. Property order never changes the output. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/** The exact bytes to sign/verify for a value (UTF-8 of its canonical encoding). */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

/**
 * Prefix a raw signature with its `signature_scheme` byte, so a verifier can
 * dispatch on the algorithm/tier (0x00 human/MAYO, 0x01 agent ML-DSA-65, ...).
 */
export function frameSignature(scheme: SignatureScheme, sig: Uint8Array): Uint8Array {
  const out = new Uint8Array(sig.length + 1);
  out[0] = scheme & 0xff;
  out.set(sig, 1);
  return out;
}

/** Split a framed signature back into its scheme byte and the raw signature bytes. */
export function unframeSignature(framed: Uint8Array): { scheme: SignatureScheme; sig: Uint8Array } {
  if (framed.length < 1) throw new ImputeError('bad-frame', 'framed signature is empty');
  return { scheme: framed[0] as SignatureScheme, sig: framed.subarray(1) };
}

/**
 * Tier-3 execution — Blake3-160 keyed MAC (SPEC §4).
 *
 * High-frequency micro-actions inside a task must not re-sign a full lattice
 * signature each time. Instead each action carries a Blake3-160 (20-byte) keyed
 * MAC whose key is derived from the Tier-2 capability: a 32-byte token secret +
 * the token's `jti` produce a per-token MAC key, and each message is tagged under
 * it. A wrong key, a tampered message, or a MAC from a different token all fail.
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { ImputeError } from './types.js';

/** Blake3 keyed-mode key length (fixed by the construction). */
export const MAC_KEY_BYTES = 32;
/** Tier-3 tag length — Blake3-160. */
export const TAG_BYTES = 20;

const MAC_DOMAIN = 'impute/tier3-mac/v1';

/**
 * Derive a per-token MAC key from a 32-byte token secret and the token's `jti`.
 * Binding the `jti` means a MAC made under one capability can never be replayed
 * under another, even with the same secret.
 */
export function deriveMacKey(tokenSecret: Uint8Array, jti: string): Uint8Array {
  if (tokenSecret.length !== MAC_KEY_BYTES) {
    throw new ImputeError('bad-mac-secret', `token secret must be ${MAC_KEY_BYTES} bytes, got ${tokenSecret.length}`);
  }
  const input = new TextEncoder().encode(`${MAC_DOMAIN}|${jti}`);
  return blake3(input, { key: tokenSecret, dkLen: MAC_KEY_BYTES });
}

/** Compute a Blake3-160 tag for `message` under a 32-byte MAC key. */
export function tag(macKey: Uint8Array, message: Uint8Array): Uint8Array {
  if (macKey.length !== MAC_KEY_BYTES) {
    throw new ImputeError('bad-mac-key', `MAC key must be ${MAC_KEY_BYTES} bytes, got ${macKey.length}`);
  }
  return blake3(message, { key: macKey, dkLen: TAG_BYTES });
}

/**
 * Constant-time verification of a Blake3-160 tag. Returns false (never throws) on
 * a wrong-length or mismatched tag, so a verifier can't be DoS'd or timing-probed.
 */
export function verifyTag(macKey: Uint8Array, message: Uint8Array, presented: Uint8Array): boolean {
  if (macKey.length !== MAC_KEY_BYTES || presented.length !== TAG_BYTES) return false;
  const expected = tag(macKey, message);
  let diff = 0;
  for (let i = 0; i < TAG_BYTES; i++) diff |= expected[i]! ^ presented[i]!;
  return diff === 0;
}

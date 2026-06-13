/**
 * Tier-1 attestation — `xtee` TEE attestation quote (SIMULATED).
 *
 * A quote binds an agent's public identity (its fingerprint) to a TEE enclave
 * measurement, so a verifier can check the key was generated inside a genuine
 * enclave. In THIS build the quote is a structurally-complete MOCK
 * (`format: "xtee-mock-v1"`, `simulated: true`): the "platform" attestation key
 * is deterministic and PUBLIC by design — it provides no real hardware guarantee,
 * only the correct shape and tamper-evidence. A production deployment swaps
 * produce/verify for real TDX / SEV-SNP quoting; the interface does not change.
 */

import { sha3_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils.js';
import { generateAgentKeyPair, sign, verifyAgent } from './keys.js';
import { type Hex, type AttestationQuote, type VerifyResult } from './types.js';

const QUOTE_CONTEXT = new TextEncoder().encode('impute/attest/xtee-mock-v1');

/**
 * The simulated enclave-platform attestation key. DETERMINISTIC + NON-SECRET on
 * purpose: TEE attestation is stubbed in this build (SPEC §2), so this is not a
 * security boundary — it exists to give quotes a real signature shape.
 */
const mockPlatform = generateAgentKeyPair('ml-dsa-65', sha3_256(new TextEncoder().encode('impute/mock-xtee-platform/v1')));

/** The default mock enclave measurement (MRENCLAVE-equivalent) for this build. */
export const MOCK_ENCLAVE_MEASUREMENT: Hex = bytesToHex(sha3_256(new TextEncoder().encode('impute/mock-enclave/v1')));

/** The (public, non-secret) mock platform attestation public key — replace with a real TEE quoting key in production. */
export function mockPlatformPublicKey(): Uint8Array {
  return mockPlatform.publicKey;
}

function quoteBody(q: Pick<AttestationQuote, 'format' | 'enclaveMeasurement' | 'reportData' | 'nonce'>): Uint8Array {
  // hex fields contain no '|', so a delimiter join is an unambiguous canonical body.
  return new TextEncoder().encode([q.format, q.enclaveMeasurement, q.reportData, q.nonce].join('|'));
}

/** Options for producing a quote. */
export interface ProduceQuoteOptions {
  /** Verifier-supplied freshness nonce (defends against quote replay). */
  nonce: Uint8Array;
  /** Override the (mock) enclave measurement; defaults to {@link MOCK_ENCLAVE_MEASUREMENT}. */
  enclaveMeasurement?: Hex;
}

/**
 * Produce an attestation quote binding `fingerprint` to an enclave measurement,
 * fresh for the given nonce. `reportData = SHA3-256(fingerprint || nonce)`; the
 * quote body is signed by the (mock) platform key.
 */
export function produceQuote(fingerprint: Hex, opts: ProduceQuoteOptions): AttestationQuote {
  const nonce = bytesToHex(opts.nonce);
  const reportData = bytesToHex(sha3_256(concatBytes(hexToBytes(fingerprint), opts.nonce)));
  const enclaveMeasurement = opts.enclaveMeasurement ?? MOCK_ENCLAVE_MEASUREMENT;
  const signature = bytesToHex(sign(mockPlatform, quoteBody({ format: 'xtee-mock-v1', enclaveMeasurement, reportData, nonce }), { context: QUOTE_CONTEXT }));
  return { format: 'xtee-mock-v1', enclaveMeasurement, reportData, nonce, signature, simulated: true };
}

/** Options for verifying a quote. */
export interface VerifyQuoteOptions {
  /** The agent fingerprint the quote must attest to. */
  fingerprint: Hex;
  /** The nonce the verifier issued (must match the quote). */
  nonce: Uint8Array;
  /** If set, the quote's enclave measurement must equal this (pin a known-good enclave). */
  expectedMeasurement?: Hex;
}

/**
 * Verify an attestation quote: format → nonce freshness → reportData binds the
 * expected fingerprint → (optional) enclave measurement pin → platform signature.
 * A tampered quote, a wrong nonce, or a mismatched fingerprint all fail with a
 * machine-readable reason.
 */
export function verifyQuote(quote: AttestationQuote, opts: VerifyQuoteOptions): VerifyResult {
  if (!quote || quote.format !== 'xtee-mock-v1') return { ok: false, reason: 'bad-format' };
  if (quote.nonce !== bytesToHex(opts.nonce)) return { ok: false, reason: 'nonce-mismatch' };
  const expectedReport = bytesToHex(sha3_256(concatBytes(hexToBytes(opts.fingerprint), opts.nonce)));
  if (quote.reportData !== expectedReport) return { ok: false, reason: 'report-data-mismatch' };
  if (opts.expectedMeasurement !== undefined && quote.enclaveMeasurement !== opts.expectedMeasurement) {
    return { ok: false, reason: 'measurement-mismatch' };
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(quote.signature);
  } catch {
    return { ok: false, reason: 'bad-encoding' };
  }
  const v = verifyAgent({ params: mockPlatform.params, publicKey: mockPlatform.publicKey }, quoteBody(quote), sigBytes, { context: QUOTE_CONTEXT });
  return v.ok ? { ok: true } : { ok: false, reason: 'bad-signature' };
}

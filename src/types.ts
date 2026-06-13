/**
 * Shared types for the impute identity protocol. These are the API- and
 * wire-level contracts every tier module implements. See SPEC.md.
 */

/** Lowercase hex string (no `0x` prefix unless a field explicitly says otherwise). */
export type Hex = string;

/**
 * The `signature_scheme` byte (XMBL/cubix wire spec): one byte that tags which
 * signature algorithm AND trust tier produced a signature, so a verifier knows
 * how to check it and at what tier to trust it. The 0x00 / 0x01 boundary is the
 * Tier-0 (human) / Tier-1 (agent) split.
 */
export enum SignatureScheme {
  /** Tier-0 human, MAYO on certified hardware — forward path (feature-flagged, not yet shippable). */
  HumanMayo = 0x00,
  /** Tier-1 agent, ML-DSA-65 (FIPS-204) — impute's default agent signature. */
  AgentMlDsa65 = 0x01,
  /** Tier-1 agent, ML-DSA-44 (FIPS-204) — lighter parameter set. */
  AgentMlDsa44 = 0x02,
  /** Tier-1 agent, ML-DSA-87 (FIPS-204) — highest parameter set. */
  AgentMlDsa87 = 0x03,
}

/** FIPS-204 ML-DSA parameter set names. */
export type MlDsaParams = 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87';

/** Map an ML-DSA parameter set to its agent `signature_scheme` byte. */
export const SCHEME_FOR_PARAMS: Readonly<Record<MlDsaParams, SignatureScheme>> = Object.freeze({
  'ml-dsa-44': SignatureScheme.AgentMlDsa44,
  'ml-dsa-65': SignatureScheme.AgentMlDsa65,
  'ml-dsa-87': SignatureScheme.AgentMlDsa87,
});

/** The set of agent (Tier-1) schemes — anything not in here is not an agent signature. */
export const AGENT_SCHEMES: ReadonlySet<SignatureScheme> = new Set([
  SignatureScheme.AgentMlDsa44,
  SignatureScheme.AgentMlDsa65,
  SignatureScheme.AgentMlDsa87,
]);

/**
 * A Tier-1 agent keypair. The secret key is sensitive: never log it, never put
 * it on the wire, and zero it when you can. impute does not store keys — that is
 * the host's responsibility (see SPEC §7).
 */
export interface AgentKeyPair {
  params: MlDsaParams;
  scheme: SignatureScheme;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** The public half of a Tier-1 identity — safe to publish (ENS text record, ERC-8004, etc.). */
export interface AgentPublicIdentity {
  params: MlDsaParams;
  scheme: SignatureScheme;
  publicKey: Uint8Array;
  /**
   * Stable, short agent id: the first 20 bytes (160 bits) of
   * `SHA3-256(domain || schemeByte || params || publicKey)`, hex-encoded.
   * Binds the scheme + parameter set so two schemes over the same key bytes can
   * never collide. This is the ZSP token subject and the ENS / ERC-8004 anchor.
   */
  fingerprint: Hex;
}

/**
 * A Tier-1 attestation quote binding an agent public key to a TEE measurement.
 * In this build the quote is a STRUCTURALLY COMPLETE MOCK (`xtee`): `simulated`
 * is always true. Real TDX/SEV-SNP quoting is a drop-in replacement (SPEC §2).
 */
export interface AttestationQuote {
  format: 'xtee-mock-v1';
  /** MRENCLAVE-equivalent: the measured identity of the (simulated) enclave. */
  enclaveMeasurement: Hex;
  /** Binds the agent into the quote: `SHA3-256(fingerprint || nonce)`, hex. */
  reportData: Hex;
  /** Freshness nonce supplied by the verifier. */
  nonce: Hex;
  /** Signature by the (simulated) attestation key over the canonical quote body, hex. */
  signature: Hex;
  /** HONEST flag: always true here — a simulated TEE, not real silicon. */
  simulated: true;
}

/**
 * A Tier-2 Zero-Standing-Privilege capability token. Scoped, short-lived, and
 * signed by the holder's Tier-1 ML-DSA key. Mints on task claim; dies on verify
 * or at `exp`. After `exp` it is mathematically dead — no standing privilege.
 */
export interface ZspToken {
  /** Token format version. */
  v: 1;
  /** Unique token id (defends against replay; enables revoke). */
  jti: Hex;
  /** Subject: the Tier-1 agent fingerprint this capability is bound to. */
  sub: Hex;
  /** Audience: the host/resource the capability is for (e.g. a handoff request id). */
  aud: string;
  /** Allowed actions — least privilege. A verifier drops out-of-scope calls. */
  scope: string[];
  /** Not-before (unix seconds). */
  nbf: number;
  /** Expiry (unix seconds) — the strict TTL/ZSP window. */
  exp: number;
  /** Signer scheme byte (a Tier-1 agent scheme). */
  scheme: SignatureScheme;
}

/** A ZSP token plus its detached ML-DSA signature and the signer's public key. */
export interface SignedZspToken {
  token: ZspToken;
  /** ML-DSA signature (hex) over the canonical encoding of `token`. */
  sig: Hex;
  /** Signer's ML-DSA public key (hex), so a verifier needs only the token to check it. */
  pub: Hex;
}

/**
 * Result of a verification. Explicit on purpose — never a bare boolean that
 * swallows the reason a check failed.
 */
export interface VerifyResult {
  ok: boolean;
  /** Machine-readable reason on failure, e.g. 'expired', 'out-of-scope', 'bad-signature'. */
  reason?: string;
}

/** A typed error so callers can branch on `.code` instead of string-matching messages. */
export class ImputeError extends Error {
  override readonly name = 'ImputeError';
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

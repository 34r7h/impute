/**
 * impute — the agentic identity protocol.
 *
 * A four-tier, verifiable identity stack that makes an AI-agent swarm accountable:
 * every agent carries a cryptographic identity and every action is attributable.
 * See SPEC.md for the full model. Modules land tier-by-tier on top of this skeleton.
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './keys.js';
export * from './attest.js';
export * from './zsp.js';
export * from './wire.js';
export * from './hmac.js';
export * from './tier0.js';
export * from './delegation/index.js';

export const VERSION = '0.2.0';

/**
 * The four-tier bifurcated identity hierarchy impute implements. Each tier is a
 * distinct cryptographic primitive with a distinct trust root; higher tiers are
 * authorized by lower ones (a human authorizes an agent, an agent mints a
 * capability, a capability keys an execution MAC).
 */
export const TIERS = Object.freeze({
  0: Object.freeze({
    key: 'human',
    primitive: 'Ledger clear-sign authorization (MAYO-ready via signature_scheme byte)',
  }),
  1: Object.freeze({
    key: 'agent',
    primitive: 'ML-DSA (FIPS-204) keypair bound to a TEE attestation quote',
  }),
  2: Object.freeze({
    key: 'capability',
    primitive: 'Zero-Standing-Privilege token — scoped, TTL-bound, ML-DSA signed',
  }),
  3: Object.freeze({
    key: 'execution',
    primitive: 'Blake3-160 keyed MAC per micro-action, keyed to the Tier-2 token',
  }),
} as const);

export type TierLevel = keyof typeof TIERS;
export * from './ens/index.js';
export * from './erc8004/index.js';

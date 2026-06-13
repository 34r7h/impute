# impute

**The agentic identity protocol.** A four-tier, verifiable identity stack that
makes an autonomous AI-agent swarm *accountable*: every agent carries a
post-quantum cryptographic identity, every privileged action is bound to a
short-lived scoped capability, and every micro-action is authenticated. The
cryptographic audit trail falls out of operating correctly.

- **Tier 0 — Human.** Hardware-wallet (Ledger) clear-sign authorization; MAYO-ready.
- **Tier 1 — Agent.** ML-DSA (FIPS-204) keypair bound to a TEE attestation quote.
- **Tier 2 — Capability.** Zero-Standing-Privilege token — scoped, TTL-bound, ML-DSA signed.
- **Tier 3 — Execution.** Blake3-160 keyed MAC per micro-action.

See [`SPEC.md`](./SPEC.md) for the full protocol. impute is **Apache-2.0** and
**dependency-light** (only [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum)
and [`@noble/hashes`](https://github.com/paulmillr/noble-hashes)) so any agent
harness can adopt it.

> **Status: v0.0.1, building tier-by-tier.** Tiers 2 and 3 (ZSP capability tokens,
> Blake3 execution MACs) are fully real. ML-DSA Tier-1 keys are real. TEE
> attestation and human MAYO are documented, structurally-complete simulations
> (flagged `simulated: true`) — the production forward path, honestly scoped.

## Install

```sh
npm install impute
```

## Quickstart

```ts
import { generateAgentKeyPair, publicIdentity } from 'impute/keys';
import { mintZspToken, verifyZspToken } from 'impute/zsp';

// Tier-1: an agent gets a post-quantum identity.
const agent = generateAgentKeyPair();           // ml-dsa-65 by default
const id = publicIdentity(agent);               // safe to publish (ENS / ERC-8004)
console.log('agent', id.fingerprint);

// Tier-2: claim a task -> mint a scoped, 5-minute capability.
const cap = mintZspToken(agent, {
  aud: 'handoff:request:963632e8',
  scope: ['update_task', 'submit_result'],
  ttlSeconds: 300,
});

// A verifier checks it with only the token (no shared secret).
console.log(verifyZspToken(cap, { action: 'update_task' }));   // { ok: true }
console.log(verifyZspToken(cap, { action: 'delete_project' })); // { ok: false, reason: 'out-of-scope' }
```

## Why

Built for [handoff](https://handoff.socnet.lol) — a network where AI agents
discover each other, team up, and settle paid work — impute is the missing
accountability primitive: a named, identified agent gets a narrow capability to
do verified work, and nothing it does is unattributable.

## Development

```sh
npm install
npm run build      # tsc -> dist/
npm test           # build + node:test
```

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).

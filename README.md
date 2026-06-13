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
**dependency-light** — [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum)
(ML-DSA) + [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (Blake3/SHA3), plus
[`viem`](https://github.com/wevm/viem) for ENS resolution and Tier-0 secp256k1 verify — so any
agent harness can adopt it.

> **Status: v0.1.0 — all four tiers shipped + verified.** Tier-0 human-approval verify,
> Tier-1 ML-DSA keys (NIST ACVP FIPS-204 KAT-validated), Tier-2 ZSP capability tokens, and
> Tier-3 Blake3-160 MACs are real, with the wire codec, ENS + ERC-8004 adapters, an adversarial
> sweep (every attack fail-closed), and a runnable example. TEE attestation and human MAYO
> remain documented, structurally-complete simulations (flagged `simulated: true`) — the honest
> production forward path.

## Install

```sh
npm install impute
```

## Quickstart

```ts
import { generateAgentKeyPair, publicIdentity } from 'impute/keys';
import { mintZspToken, authorizeZspToken } from 'impute/zsp';

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

// Authorize a specific action with only the token (no shared secret).
// action + aud are required, so scope/audience can never be skipped by accident.
console.log(authorizeZspToken(cap, { action: 'update_task', aud: 'handoff:request:963632e8' }));   // { ok: true }
console.log(authorizeZspToken(cap, { action: 'delete_project', aud: 'handoff:request:963632e8' })); // { ok: false, reason: 'out-of-scope' }
```

## Run the full four-tier flow

```sh
node examples/end-to-end.mjs   # human approval → ML-DSA identity → attestation → ZSP capability → Blake3 MAC → verify
```

## Modules

**Core** (re-exported from the package root): `impute/keys` (Tier-1 ML-DSA) · `impute/attest`
(TEE attestation) · `impute/zsp` (Tier-2 capability tokens) · `impute/hmac` (Tier-3 Blake3 MAC)
· `impute/wire` (canonical codec + `signature_scheme` byte) · `impute/tier0` (Tier-0 human
clear-sign verify).

**Integration adapters** (subpath imports): `impute/ens` (agent identity + discovery via ENS
subnames & text records) · `impute/erc8004` (on-chain agent registry + BigQuery reputation) ·
`impute/circle` (Circle W3S Programmable-Wallets — real agent-to-agent USDC settlement).

## Docs

- [`SPEC.md`](./SPEC.md) — the protocol, tier by tier
- [`docs/SETTLEMENT.md`](./docs/SETTLEMENT.md) — x402 rails (Base + Arc) + Circle W3S wallet settlement
- [`docs/LEDGER_TIER0.md`](./docs/LEDGER_TIER0.md) — Tier-0 / Ledger design + MAYO SDK feedback

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

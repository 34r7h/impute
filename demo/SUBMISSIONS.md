# Per-sponsor submissions — Handoff × Impute (ETHGlobal NY26)

One short blurb per sponsor track. Every on-chain claim is real and independently re-verifiable via the
live-boundary scripts in `handoff/scripts/verification/` (see [VERIFICATION.md](VERIFICATION.md)). Scope
limits are stated up front in [SCOPE.md](SCOPE.md).

---

## Impute — the accountability spine (OSS)
A four-tier cryptographic identity protocol for agent swarms: **Tier-0** human Ledger consent · **Tier-1**
post-quantum ML-DSA-65 agent keys · **Tier-2** Zero-Standing-Privilege capability tokens (scoped, TTL'd,
burned on verify) · **Tier-3** Blake3 keyed MACs per micro-action. Public, Apache-2.0, `v0.2.0`,
git-installable, runnable example + adversarial sweep. ML-DSA-65 validated against the official NIST ACVP
FIPS-204 known-answer vectors. Repo: `github.com/34r7h/impute`.

## Ledger — Tier-0 human authority
Privileged actions on the **real** handoff broker (spawn an agent, designate an orchestrator, set a
spending limit, set/port an ENS name, release an over-cap payout) are gated by an **EIP-712 clear-sign**
verified with `verifyHumanApprovalEIP712`, bound to `{action, subject, amount}`. No device signature →
the action **fails closed** (never a faked pass). Deployed to production, money-safe (off by default; a
single env flag arms it). This is the human-in-the-loop anchor the whole swarm hangs from.

## ENS — agent-owned identity & discovery
Agents resolve to a real ENS hierarchy on Sepolia: `socnet.eth → handoff.socnet.eth →
claude.handoff.socnet.eth`. `AgentResolver.resolve()` reads the agent's `impute.fingerprint`, `impute.caps`,
`impute.webhook`, and `impute.x402` text records. **Keystone:** the `impute.fingerprint` on ENS equals the
fingerprint anchored in the agent's on-chain ERC-8004 identity (`0463b0c2…`) — ENS and ERC-8004 agree.
A permanence guard makes any `socnet.eth` subdomain write require explicit user acknowledgement first.

## ERC-8004 + Google Cloud (BigQuery) — on-chain identity & reputation
The agent's identity is registered as **ERC-8004 token #6558** on Sepolia (register tx
`0x0f9065a1…`, owner `0xDA5D…`); `tokenURI(6558)` resolves to its metadata and the fingerprint matches
ENS. Reputation is computed by querying on-chain events over **`bigquery-public-data.crypto_ethereum`**
(service-account auth, `maximumBytesBilled` capped) — a portable, verifiable reputation score, not a
self-asserted number.

## Circle / Arc — gasless USDC settlement
Verified, funded task payouts settle in **USDC, gasless** via EIP-3009 `transferWithAuthorization` over the
x402 rail, with **Arc** (chain `5042002`) as the editable default settlement network. Proof: a real Circle
W3S USDC transfer of **1 USDC** confirmed on Ethereum Sepolia — tx `0x9f9a6d22…`, block `11053950`,
emitted by the canonical Sepolia USDC contract, cross-checked on two independent RPCs (15/15 live-boundary
assertions pass). Money-safe: live movement is flag-gated and off by default.

---

### How to re-verify (no trust required)
```bash
cd handoff
node scripts/verification/verify-live-e-c2.mjs   # ERC-8004 #6558 + the 1-USDC Circle transfer (15/15)
node scripts/verification/verify-live-b-hierarchy.mjs   # ENS records == ERC-8004 fingerprint
node scripts/verification/verify-live-all.mjs    # the whole spine
```

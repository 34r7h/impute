# Scope — what is real, what we did NOT do

A plain statement of boundaries. Nothing here is simulated to look like more than it is; the limits are
named on purpose because naming them is what makes the rest credible.

## Real (and independently re-verifiable)
- **Post-quantum identity crypto** — ML-DSA-65 (FIPS-204), validated against the official **NIST ACVP**
  known-answer vectors. Real signatures, real verification.
- **Zero-Standing-Privilege** capabilities (Tier-2) — scoped, time-limited, **burned on verify**;
  out-of-scope actions fail closed.
- **Tier-3 Blake3-160** keyed MAC per micro-action.
- **Tier-0 Ledger gate** — real **EIP-712 clear-sign** verification gating real broker actions; fails
  closed with no device signature. Live on production.
- **On-chain identity** — **ERC-8004 #6558** on Ethereum Sepolia, cross-anchored to **ENS**
  (`claude.handoff.socnet.eth`).
- **Settlement** — a real **1-USDC Circle** transfer on Sepolia (gasless, EIP-3009), Arc rail as the
  default network.
- **Governance** — the full **verifier ≠ builder** receipt chain: every task signed off by a different
  agent than built it, zero self-verifications.

## NOT in scope (stated, not hidden)
- **NOT MAYO.** The post-quantum scheme is **ML-DSA-65**, not MAYO. (MAYO was considered; we shipped the
  NIST-standardized scheme instead.)
- **NO TEE attestation.** There is **no** hardware trusted-execution-environment / enclave attestation.
  Identity rests on the key hierarchy + on-chain anchoring, not on a hardware quote. Any earlier "TEE"
  wording was wrong and has been removed.
- **Testnet only / money-safe.** All fund movement is on public **testnets**; live transfers require an
  explicit operator key **and** a feature flag, both off by default. No mainnet, no custody of user funds.

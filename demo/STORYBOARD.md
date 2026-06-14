# Handoff × Impute: ≤3-Minute Video Storyboard & Shot-List

*A step-by-step production outline for the final video submission. All on-chain references below are
real and independently re-verifiable — see [VERIFICATION.md](VERIFICATION.md) and the live-boundary
scripts in `handoff/scripts/verification/`.*

---

## 1. Video Overview
*   **Total Duration**: 2m 45s (Target: < 3 minutes)
*   **Audio**: Voiceover (clear, technical) + subtle background synth.
*   **Style**: High-fidelity screen recordings of terminal/dashboard output mixed with architecture slides.

---

## 2. Storyboard Sequence

### Scene 1: The Problem (0:00 – 0:30)
*   **Visual**: Slide of an AI agent swarm. An "Attacker" node lifts a static API key from a database → "Funds Drained" alert.
*   **Voiceover**:
    > *"AI agent swarms are scaling fast, but they share one security bottleneck: standing privilege. Today's agents hold permanent root credentials — compromise one and the whole treasury is exposed. And swarms lack cryptographic accountability: no verifiable, per-action trail of which agent did what, and no capability that expires the instant the work is done."*

### Scene 2: The Solution — the Impute Stack (0:30 – 1:15)
*   **Visual**: The four-tier stack, each tier highlighted in turn:
    1.  *Tier 0 (Human)*: Ledger clear-sign.
    2.  *Tier 1 (Agent)*: ML-DSA-65 post-quantum keys.
    3.  *Tier 2 (Capability)*: Zero-Standing-Privilege tokens.
    4.  *Tier 3 (Execution)*: Blake3 micro-action MACs.
*   **Voiceover**:
    > *"Impute is a four-tier cryptographic identity protocol that makes agent swarms accountable. Tier 0: a human owner clear-signs consent on a Ledger hardware wallet before any privileged action. Tier 1: the agent holds post-quantum ML-DSA-65 keys, its fingerprint published on ENS and cross-anchored to an on-chain ERC-8004 identity. Tier 2: Zero-Standing-Privilege tokens replace root keys — capabilities are scoped to specific actions and minutes of life, then burned on verify. Tier 3: every micro-action is authenticated by a Blake3 keyed MAC bound to that token."*

### Scene 3: The Live Demo (1:15 – 2:30)
*   **Visual**: Screen recording of the Impute spine running, narrating each step as it streams:
    *   *1:15 – 1:30*: Tier-0 human consent — a Ledger EIP-712 clear-sign authorizes the privileged action; with no device signature present, it **fails closed**.
    *   *1:30 – 1:45*: The agent's ephemeral ML-DSA-65 key (fingerprint `0463b0c2…`) is issued; its fingerprint is the same value anchored on-chain.
    *   *1:45 – 2:00*: Live Sepolia anchoring — ERC-8004 identity **#6558** (register tx `0x0f9065a1…`), discoverable on ENS at **`claude.handoff.socnet.eth`** whose `impute.fingerprint` text record equals the ERC-8004 fingerprint (`AgentResolver.resolve()`).
    *   *2:00 – 2:10*: Tier-2 ZSP gating — `submit_result` authorizes, while an out-of-scope `destroy_database` **fails closed**.
    *   *2:10 – 2:20*: Tier-3 Blake3-160 execution MAC generated + verified.
    *   *2:20 – 2:30*: Settlement — a USDC payout over the Tier-0 threshold triggers the human approval gate; once verified, a real Circle USDC transfer of **1 USDC** settles on Sepolia (tx `0x9f9a6d22…`, block 11053950), and reputation is indexed from on-chain ERC-8004 events via BigQuery.
*   **Voiceover**:
    > *"Watch it live. The human owner clear-signs a Tier-0 authorization on a Ledger; without it, the action fails closed. The agent's post-quantum ML-DSA-65 identity, fingerprint `0463b0c2`, is anchored on-chain as ERC-8004 token #6558 and resolves on ENS at `claude.handoff.socnet.eth`. A Tier-2 Zero-Standing-Privilege token is minted, scoped to this task's actions; an unauthorized database delete fails closed instantly. The agent signs its execution with a Tier-3 Blake3 MAC. Finally a 1-USDC payout crosses the threshold, the Tier-0 human gate fires, and once the signature verifies, Circle settles the transfer on Sepolia — transaction `0x9f9a6d22`, gasless for the payee — and the agent's public reputation updates from on-chain events in BigQuery."*

### Scene 4: Swarm Governance & Conclusion (2:30 – 2:45)
*   **Visual**: The Live Verification Audit Trail — every task verified by a different agent than built it (0 self-verifications, 100% independent checks).
*   **Voiceover**:
    > *"Under Impute, governance is a byproduct of operation: every commit and settlement is verified by a different, independent agent — verifier never equals builder. That's the receipt chain. Accountable, capability-scoped, post-quantum swarm collaboration. Build it with Impute."*

---

*Scope note (state it on-screen and in voiceover): real post-quantum crypto (ML-DSA-65, NIST KAT-validated)
— NOT MAYO — and NO TEE attestation; the on-chain identity + settlement are real on public testnets. See
[SCOPE.md](SCOPE.md).*

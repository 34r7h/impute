# Handoff × Impute: Slide Presentation Content (3-Minute Pitch)

This document contains the final copy and layout details for the presentation slides.

---

### Slide 1: Title Slide
*   **Slide Header**: Handoff: Accountable AI Swarms via the Impute Protocol
*   **Subtitle**: Post-quantum identity, zero-standing privilege, and instant reputation tracking for autonomous agent networks.
*   **Visual Elements**:
    *   Dark background with neon green/cyan cryptographic linkages connecting multiple agent nodes.
    *   A primary graphic showing the four-tier bifurcated security matrix.
*   **Key Message**: swarms can operate securely without static credentials or central single points of failure.

---

### Slide 2: The Problem: The Danger of Autonomous Swarms
*   **Slide Header**: The Swarm Security Gap
*   **Core Pain Points**:
    *   **Zero-Standing Privilege Failure**: Agents are routinely handed long-lived, high-privilege API keys. If one agent is compromised, the entire infrastructure falls.
    *   **Attribution Collapse**: Traditional logs record IP addresses or system actors. In a swarm of recursive agent spawns, it is cryptographically impossible to trace which agent executed which sub-action.
    *   **No Hardware Root**: Swarms operate in virtualized cloud environments with no hardware-backed proof of secure execution (TEE) or direct human delegation consent.

---

### Slide 3: The Solution: The Impute Protocol
*   **Slide Header**: The Four-Tier Verifiable Stack
*   **The Tiers**:
    *   **Tier 0: Human Consent (Hardware-Rooted)**
        *   *Mechanism*: Ledger clear-sign ECDSA/secp256k1 (MAYO-ready).
        *   *Purpose*: Establish human intent before spawning an agent or signing high-value settlements.
    *   **Tier 1: Agent Identity (Hardware-Bound)**
        *   *Mechanism*: ML-DSA-65 post-quantum signature key pairs bound to TEE (SGX/TDX) attestation quotes.
        *   *Purpose*: Cryptographically verify that the agent runs in secure hardware.
    *   **Tier 2: Zero-Standing Privilege (ZSP)**
        *   *Mechanism*: Scoped, TTL-bound, ML-DSA signed capability tokens.
        *   *Purpose*: Eliminate persistent keys. Agents only hold scoped credentials valid for minutes.
    *   **Tier 3: Keyed Execution MACs**
        *   *Mechanism*: Blake3-160 keyed MAC per micro-action.
        *   *Purpose*: Bind every API call or database write to the exact active ZSP capability token.

---

### Slide 4: Swarm Lifecycle & Architecture
*   **Slide Header**: End-to-End Swarm Execution Flow
*   **Architecture Flow**:
    ```
    [Ledger Clear-Sign] 
           │ (Tier 0: Consent to Spawn)
           ▼
    [Agent Enclave Spawn] ──► [ENS Subname Publish] ──► [ERC-8004 Registry]
           │ (Tier 1: ML-DSA Keys + TEE Quote)
           ▼
    [ZSP Token Minted] 
           │ (Tier 2: 5-minute Scoped TTL)
           ▼
    [Blake3 Execution MAC] ──► [Arc USDC Gasless Settle] ──► [BigQuery Reputation Engine]
           │ (Tier 3: Action tag check)
    ```
*   **Key Advantage**: The entire lifecycle is self-documenting and cryptographically linked from the human's hardware key down to the micro-action MAC and final reputation index.

---

### Slide 5: Swarm Safety & Performance Impact
*   **Slide Header**: Real-World Security Guarantees
*   **Key Comparison Metrics**:
    *   **Static Credentials**: 0 permanent keys stored on disk (vs. hundreds in typical systems).
    *   **Auditability**: 100% of micro-actions carry non-repudiable cryptographic tags.
    *   **Governance Gates**: Automatic fail-closed threshold gates (e.g. settlements > 100 USDC automatically block until a Tier-0 Ledger signature is verified).
    *   **Integration Overhead**: Non-intrusive. The ZSP adapter mints capabilities on task claim and burns them on verification, preserving native app performance.

---

### Slide 6: Independent Swarm Governance: Live Verification Trail
*   **Slide Header**: Verifiable Swarm Governance In Action
*   **Live Metrics from Project `963632e8` (Goal A/B/E Settlement)**:
    *   **Total Verified Tasks**: 13/13 tasks.
    *   **Self-Verification Rate**: 0% (Strict builder-verifier isolation: verifier ≠ builder).
    *   **Adversarial Sweeps**: 100% fail-closed (Expired token replays, cross-key signature forgery, wrong-context ML-DSA signatures, and tampered MAC keys are all rejected automatically).
    *   **Audit trail as a byproduct**: The receipt chain is naturally assembled by the normal run of the swarm, written out to the immutable markdown audit log.

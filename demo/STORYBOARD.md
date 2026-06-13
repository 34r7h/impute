# Handoff × Impute: <=3-Minute Video Storyboard & Shot-List

*A step-by-step production outline for the final video submission.*

---

## 1. Video Overview
*   **Total Duration**: 2m 45s (Target: < 3 minutes)
*   **Audio**: Voiceover (clear, technical, enthusiastic) + subtle background synth music.
*   **Style**: High-fidelity screen recordings of terminal/dashboard output mixed with polished slides showing the architecture.

---

## 2. Storyboard Sequence

### Scene 1: The Problem (0:00 - 0:30)
*   **Visual**: Polished Slide showing an AI agent swarm. An "Attacker" node intercepts a static API key from a database, triggering a "Funds Drained" alert.
*   **Voiceover**: 
    > *"AI agent swarms are expanding rapidly, but they face a critical security bottleneck: standing privilege. Today's agents carry permanent root credentials. If a single agent is compromised, your entire treasury is at risk. Even worse, swarms lack cryptographic accountability — there is no verifiable trail of which agent executed which sub-action, and no hardware-backed proof of secure execution."*

### Scene 2: The Solution: Impute Stack (0:30 - 1:15)
*   **Visual**: Slide transition to Slide 3 (The Four-Tier Stack). Each tier highlights sequentially:
    1.  *Tier 0 (Human)*: Ledger clear-sign.
    2.  *Tier 1 (Agent)*: ML-DSA-65 keys + TEE.
    3.  *Tier 2 (Capability)*: Zero-Standing-Privilege tokens.
    4.  *Tier 3 (Execution)*: Blake3 micro-action MACs.
*   **Voiceover**: 
    > *"Introducing Impute: a four-tier cryptographic identity protocol that makes agent swarms fully accountable. It begins at Tier 0, where a human owner clear-signs consent on a Ledger hardware wallet to spawn an agent. At Tier 1, the agent generates post-quantum ML-DSA keys inside a TEE, registering its fingerprint on ENS. At Tier 2, Zero-Standing-Privilege tokens replace root keys, granting capabilities scoped to specific actions and minutes of life. Finally, at Tier 3, every single micro-action is authenticated by a Blake3 keyed MAC bound directly to that token."*

### Scene 3: The Live Demo (1:15 - 2:30)
*   **Visual**: Screen recording of a terminal running `node examples/end-to-end.mjs`. The narrator highlights the steps as they output in real-time.
    *   *1:15 - 1:30*: Show Tier 0 Ledger clear-sign prompt and successful signature recovery.
    *   *1:30 - 1:45*: Show Tier 1 ML-DSA key generation and mock TEE quote validation.
    *   *1:45 - 2:00*: Show mock ENS registration and Tier 2 ZSP token gating (updating a task works, database deletion gets blocked).
    *   *2:00 - 2:15*: Show Tier 3 Blake3 MAC tag generation and verification.
    *   *2:15 - 2:30*: Show Arc x402 USDC Settlement. Emphasize the **Threshold Gate Warning**: a payout of 250 USDC exceeds the 100 USDC threshold, requiring and successfully verifying a new Tier-0 human Ledger signature before settling gasless EIP-3009 USDC on Base. Show BigQuery reputation updating to 1.00.
*   **Voiceover**: 
    > *"Let's watch this live in the Impute end-to-end demo script. First, we establish Tier-0 consent, recovering the human's Ledger wallet address. The agent spawns, generating its post-quantum keys and TEE quote. It registers on ENS, and is issued a short-lived ZSP token scoped strictly to task actions. Database deletion attempts fail closed immediately. When the agent completes the work, it tags the payload with a Blake3 execution MAC. The broker validates the MAC and gates the settlement payout. Because the payout is 250 USDC — exceeding our 100 USDC threshold — it triggers an automatic gate, waiting for and verifying a second Tier-0 Ledger signature before releasing the gasless USDC EIP-3009 transfer on Base. The completion is indexed, updating the agent's public reputation score in BigQuery."*

### Scene 4: Swarm Governance & Conclusion (2:30 - 2:45)
*   **Visual**: Polished Slide 6 (Live Verification Audit Trail) showing the `AUDIT_TRAIL.md` table (13/13 tasks, 0 self-verifications, 100% independent checks).
*   **Voiceover**: 
    > *"By running our swarm under Impute, governance becomes a natural byproduct of operation. Every commit and settlement is verified by independent agents in isolated enclaves. This is the future of secure, accountable, and trustless swarm collaboration. Build safely with Impute."*

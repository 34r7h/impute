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
*   **Visual**: Screen recording of a terminal running `node assay/impute-spine.mjs`. The narrator highlights the steps as they output in real-time.
    *   *1:15 - 1:30*: Show Tier 0 human consent (Ledger/hot-key signature) authorizing manager key issuance.
    *   *1:30 - 1:45*: Show manager generating and signing issuance of the ephemeral ML-DSA-65 agent key (fingerprint: `48b7f5...`), backed by TEE quote verification.
    *   *1:45 - 2:00*: Show live Sepolia on-chain anchoring (ERC-8004 tx `0xd85d8766...` and ENS name resolution for `agent-48b7f5.handoff.socnet.eth` using `AgentResolver.resolve()`).
    *   *2:00 - 2:10*: Show Tier 2 scoped capability token (ZSP) gating (authorizing `submit_result` succeeds, while unauthorized action `destroy_database` fails closed).
    *   *2:10 - 2:20*: Show Tier 3 Blake3-160 execution MAC generation and verification.
    *   *2:20 - 2:30*: Show USDC settlement: payout of 0.50 USDC > 0.00 threshold triggers human (Tier-0) approval gate. Signature is verified, and the live Circle transaction settles on Sepolia (tx `0x748fd21b...`). Show reputation updated in BigQuery.
*   **Voiceover**: 
    > *"Let's watch this live in the Impute spine script. First, the human owner clear-signs a Tier-0 authorization to designate a project manager. The manager spawns an ephemeral agent key, `48b7f5`, generating its post-quantum signature and verifying the TEE quote. This identity is anchored on-chain via ERC-8004 in transaction `0xd85d8766` and discoverable on ENS at `agent-48b7f5.handoff.socnet.eth`, which resolves directly to its cryptographic records. Next, a Tier-2 Zero-Standing-Privilege token is minted, scoped to specific task actions; unauthorized attempts like database deletion fail closed instantly. The agent completes the task and signs its execution with a Tier-3 Blake3 MAC. Finally, the USDC settlement payout of 0.50 USDC exceeds our zero threshold, triggering an automatic Tier-0 human approval gate. Once the human signature is verified, Circle executes the transfer on Sepolia in transaction `0x748fd21b`, and the completion is indexed to update the agent's public reputation score in BigQuery."*

### Scene 4: Swarm Governance & Conclusion (2:30 - 2:45)
*   **Visual**: Polished Slide 6 (Live Verification Audit Trail) showing the `AUDIT_TRAIL.md` table (13/13 tasks, 0 self-verifications, 100% independent checks).
*   **Voiceover**: 
    > *"By running our swarm under Impute, governance becomes a natural byproduct of operation. Every commit and settlement is verified by independent agents in isolated enclaves. This is the future of secure, accountable, and trustless swarm collaboration. Build safely with Impute."*

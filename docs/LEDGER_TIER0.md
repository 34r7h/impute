# Tier-0 — Human authority on Ledger (design + SDK feedback)

Tier-0 is the root of the delegation chain: a human authorizes high-risk agent actions
(spawning an agent, settling above a threshold) by **clear-signing** an approval on a
hardware wallet. impute implements the **verification** side (`src/tier0.ts`); the signing
happens on the device.

## What ships

- **`verifyHumanApproval(payload, signature, humanAddress)`** — checks an ECDSA/secp256k1
  (EIP-191) signature recovers the authorized human address over the exact, legible
  clear-signed message, within its `exp` window. Returns an explicit `{ ok, reason }`.
- **`buildApprovalMessage(payload)`** — the deterministic, human-legible string the device
  shows. Clear-signing means the human sees *precisely* what they authorize (action,
  subject, amount, nonce, expiry) — the whole point of a hardware root of intent.
- **`requiresApproval(action, amount, threshold)`** — the gate: agent spawns always need
  approval; settlements need it past a configurable threshold; everything else is autonomous.
- **`signature_scheme` byte `0x00` (HumanMayo)** — see `src/wire.ts`. Every Tier-0 signature
  is tagged so a verifier dispatches on algorithm + trust tier. `0x00` is ECDSA today and
  **MAYO-ready** the moment certified hardware exists — no wire change needed to flip it.

## Why ECDSA today, MAYO behind the byte (the honest scope)

The XMBL spec mandates **MAYO** at Tier-0. Shipping a half-baked MAYO this weekend would be
*worse* than ECDSA, and stating that crisply strengthens the Ledger submission — Ledger's
judges reward clear autonomy/approval boundaries and honest SDK feedback.

- **Memory.** Ledger secure elements expose roughly **50–64 KB** of user RAM shared with the
  OS. Reference MAYO targets Cortex-M4-class devices with ~128 KB RAM, and MAYO's
  "whipping"/expanded-key matrices are RAM-hungry; memory-optimized M4 variants exist but pay
  heavy signing-speed penalties. A safe MAYO signer does not fit the SE headroom in a weekend.
- **Standardization.** MAYO is a **NIST Round-2 onramp candidate**, not a standard. Ledger's
  own PQC work (Donjon, since 2024) targets **lattice** schemes (Kyber/ML-DSA), not
  multivariate-quadratic MAYO.
- **The irony that becomes the point.** An *uncertified software* MAYO would be single-trace
  side-channel vulnerable — and under XMBL's own rules that leakage is exactly what marks a
  signer as **not** a trusted human. A half-baked MAYO would make Tier-0 *fail* its own
  humanity proof. So the correct prototype move is: **Ledger = the clean, clear-signed Tier-0
  anchor today**, with a `signature_scheme` byte that is MAYO-ready when certified hardware
  exists.

## SDK feedback (what the Ledger prize asks for)

1. **Clear-sign legibility is the product, not a constraint.** Our approval message is plain
   key/value lines so the human reads exactly what they authorize on-device. A generic
   blind-sign of an opaque hash would defeat Tier-0's accountability — clear-sign plugins /
   ERC-7730 descriptors are the right surface, and a first-class "structured approval" intent
   (action + subject + amount + nonce + expiry) would let agentic apps adopt this without
   custom plugins.
2. **Expose a stable scheme/version tag.** Agentic protocols need to negotiate "which signer
   produced this" across a fleet; a documented signature-scheme/version byte at the SDK
   boundary (so apps don't reverse-engineer it) would make multi-tier stacks like impute
   portable.
3. **PQC forward path.** Donjon's lattice focus is the right call; please publish the SE RAM
   budget and a reference "is this scheme feasible on this device" matrix so builders can pick
   MAYO vs SPHINCS+ vs lattice honestly instead of guessing.

## Production path

Replace the ECDSA verify with the device's MAYO (or certified PQC) signature behind the same
`0x00` scheme byte and the same `verifyHumanApproval` interface — the gate, the message
format, and every caller stay identical.

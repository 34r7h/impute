# impute — protocol specification (v0.0.1)

impute is an **agentic identity protocol**: a four-tier, verifiable identity stack
that makes an autonomous AI-agent swarm *accountable*. Every agent carries a
cryptographic identity; every privileged action is bound to a short-lived,
scoped capability; every micro-action is authenticated. The cryptographic audit
trail is a byproduct of operating correctly, not a separate deliverable.

This document is the contract the library implements, tier by tier. Where a tier
is **simulated** for this prototype, it says so plainly — honest scope is a
feature, not a footnote.

---

## 1. The four-tier bifurcated identity hierarchy

| Tier | Name | Primitive | Trust root | Status in this build |
|---|---|---|---|---|
| **0** | Human | Ledger clear-sign authorization; `signature_scheme = 0x00`, MAYO-ready | A human + hardware wallet | Clear-sign today; MAYO behind a feature flag (see §6) |
| **1** | Agent | **ML-DSA (FIPS-204)** keypair bound to a TEE **attestation quote** | Tier-0 approval + enclave measurement | ML-DSA **real**; attestation **simulated** (`xtee` mock) |
| **2** | Capability | **Zero-Standing-Privilege (ZSP)** token — scoped, TTL-bound, ML-DSA signed | A Tier-1 agent key | **Fully real** |
| **3** | Execution | **Blake3-160** keyed MAC, keyed to the Tier-2 token | A Tier-2 token | **Fully real** |

Higher tiers are authorized by lower ones: a human authorizes an agent, an agent
mints a capability, a capability keys an execution MAC. A signature at any tier
is tagged with a one-byte `signature_scheme` so a verifier always knows *which*
algorithm and *which* tier produced it.

The honest-scope posture matches the source manuscript: "Mainnet requirement:
constant-time MAYO hardware wallets; fallback evaluation of SPHINCS+ … if
compliant hardware cannot be certified." We ship the real lattice crypto (ML-DSA)
and the real capability/execution tiers, and we mark the human-MAYO and
TEE-attestation pieces as the documented forward path.

---

## 2. Tier 1 — Agent identity (`keys`, `attest`)

**Keys.** Each agent generates an ML-DSA keypair (`ml-dsa-65` by default;
`-44`/`-87` selectable). Keygen is deterministic from a 32-byte seed, so the same
seed reproduces the same key (this is what FIPS-204 known-answer tests check).
Signing/verification use FIPS-204 with an optional domain-separation `context`.

- **Fingerprint** — the stable, short agent id: the first 20 bytes (160 bits) of
  `SHA3-256(domain || scheme_byte || params || publicKey)`, hex-encoded. This is
  what we publish to ENS text records and ERC-8004, and what a ZSP token names as
  its subject. It is collision-resistant and binds the parameter set + scheme so
  two different schemes over the same key bytes can never share a fingerprint.

**Attestation.** A quote binds the agent public key to an enclave measurement so
a verifier can check the key was generated inside a genuine TEE. In this build
the quote is a **structurally complete mock** (`format: "xtee-mock-v1"`,
`simulated: true`): it carries an `enclaveMeasurement`, a verifier-supplied
`nonce`, `reportData = SHA3-256(fingerprint || nonce)`, and a signature by a
simulated attestation key. The verifier rejects a tampered quote, a wrong nonce,
or a fingerprint mismatch. Swapping the mock for a real TDX/SEV-SNP quote is a
drop-in: the verifier interface does not change.

---

## 3. Tier 2 — Capability (`zsp`) — the heart of the swarm

A **Zero-Standing-Privilege token** grants a narrow, time-boxed capability:

```
ZspToken {
  v: 1, jti, sub (agent fingerprint), aud (host/resource),
  scope: string[], nbf, exp, scheme
}
SignedZspToken { token, sig (ML-DSA over canonical bytes), pub }
```

- **Mint** on task claim, **die** on verify or at `exp`. After `exp` the token is
  mathematically dead — there is no standing privilege to revoke later.
- **Scope** is least-privilege: a verifier drops any call whose action is not in
  `scope`, even with a valid signature.
- **Canonical encoding** — the signed bytes are a deterministic JSON serialization
  with sorted keys, so a verifier reconstructs exactly what was signed. (Detailed
  in `wire`, §5.)
- **Adapter hooks** — `zsp` exposes `onClaim`/`onVerify`/`onExpire` hooks so a
  host app wires token mint/burn into its own task lifecycle without impute
  knowing anything about that app. handoff maps `update_task{in_progress}` →
  mint, `verify_task` / TTL → burn.

Verification checks, in order: signature valid → `scheme` is an agent scheme →
`sub` matches the presented identity → now within `[nbf, exp)` → requested action
∈ `scope` → `jti` not revoked. The first failure returns a machine-readable
`reason`.

---

## 4. Tier 3 — Execution (`hmac`)

High-frequency micro-actions inside a task must not re-sign a full lattice
signature each time. Instead each action carries a **Blake3-160 keyed MAC** whose
key is derived from the Tier-2 token (`blake3(domain || jti, key=tokenKey)` →
32-byte MAC key; per-message tag is `blake3(message, key=macKey, dkLen=20)`). A
wrong key, a tampered message, or a MAC from an expired token all fail. This is
also the per-message authentication layer for an encrypted team channel.

---

## 5. Wire format (`wire`)

- **`signature_scheme` byte** — `0x00` human/MAYO, `0x01` agent ML-DSA-65,
  `0x02` ML-DSA-44, `0x03` ML-DSA-87. Every signature on the wire is prefixed
  with its scheme byte, so a verifier dispatches on it.
- **Canonical token codec** — deterministic, sorted-key encoding for anything
  that gets signed (ZSP tokens, quote bodies), so signer and verifier agree on
  the exact bytes. Round-trips losslessly.

---

## 6. Honest scope (put this on the demo slide)

| Tier | Spec mandate | This build | Simulated? |
|---|---|---|---|
| 0 Human | MAYO on certified HW | Ledger clear-sign (ECDSA today); MAYO behind a flag via `signature_scheme 0x00` | MAYO simulated |
| 1 Agent | ML-DSA in Intel TDX / SEV-SNP | Real ML-DSA keys; `xtee` attestation mock on a Confidential-VM-shaped host | TEE attestation stubbed |
| 2 Capability | ZSP token, ML-DSA signed | **Fully real**, wired to a host task lifecycle | No |
| 3 Execution | Blake3 keyed MAC | **Fully real**, per-message auth | No |

A half-baked software MAYO would be single-trace side-channel vulnerable — and
under the XMBL rules that leakage is exactly what marks a signer as *not* a
trusted human. So the correct prototype move is Ledger = a clean clear-signed
Tier-0 anchor today, with a `signature_scheme` byte that is MAYO-ready the moment
certified hardware exists.

---

## 7. Non-goals / security notes

- impute does **not** manage key storage or a key vault — it returns key material
  to the caller; storing it safely (HSM, OS keychain, sealed vault) is the host's
  job. Never serialize a secret key to logs or the wire.
- impute is **dependency-light on purpose**: only `@noble/post-quantum`
  (ML-DSA, audited) and `@noble/hashes` (Blake3, SHA3). Adopt it from any harness.
- Every verification returns an explicit `{ ok, reason }` — never a bare boolean
  that hides *why* a check failed.

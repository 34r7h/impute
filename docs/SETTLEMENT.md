# Settlement architecture — dual-rail x402 (Base + Arc)

GOAL C. handoff settles verified task payouts as **gasless USDC transfers over x402**
(EIP-3009 `transferWithAuthorization`). The rail is per-task: the spender picks the
`network` on the task's payment, and settlement runs on that chain. **Base-sepolia** is the
default; **Arc (Circle)** is added as a second rail for real agent-to-agent nanopayments.

## Flow (per verified task)

```
 builder submits work ──> verify_task (orchestrator signs off)
        │                        │
        │                  task.status = verified
        ▼                        ▼
 ZSP capability burns      settler picks the task's `network`
 (impute Tier-2)                 │
                    ┌────────────┴─────────────┐
                    ▼                           ▼
           network = base-sepolia        network = arc-sepolia
           (default; public x402         (env: USDC_ARC + an Arc-capable
            facilitator)                  X402_FACILITATOR_URL = Circle Gateway)
                    │                           │
                    ▼                           ▼
        EIP-3009 transferWithAuthorization (USDC, atomic units)
                    │                           │
                    ▼                           ▼
            on-chain USDC tx          gasless via Circle Gateway
                    └────────────┬──────────────┘
                                 ▼
                   receipt (tx id) -> task.paid + notification.payment
```

## Rails

| Rail | network | USDC token | Facilitator | Status |
|---|---|---|---|---|
| **Base** (default) | `base-sepolia` | `0x036CbD…` (testnet) | public x402.org | live |
| **Arc** (Circle) | `arc-sepolia` (`ARC_NETWORK`) | `USDC_ARC` (env) | `X402_FACILITATOR_URL` → Circle Gateway | **env-gated, money-safe — off until provisioned** |

Adding Arc was a one-line, **money-safe** registry entry (`src/payments.ts buildRequirements`):
env-driven so no token address is ever guessed, and the rail is inert until `USDC_ARC` +
a Circle-Gateway facilitator are set. The settler, the EIP-3009 signing, and the receipt
path are rail-agnostic — they already key off the task's `network`.

## Why Arc / Circle Gateway

The Arc track wants **real agent-to-agent nanopayments**, not one big transfer: each verified
task settles its own small USDC payout gas-free as work is confirmed. handoff's settlement is
already wired to `verify_task`, so routing a subset of payouts through Arc/Gateway satisfies
that with the *actual* swarm's settlement traffic — the demo data is the build's own activity.

## Money-safe posture

- Testnet only. No live fund movement without an explicit treasury key **and** the rail's env
  set (`USDC_ARC` + facilitator). Auto-settlement falls back to a 402 (verifier signs) when a
  treasury payer isn't configured — verification never silently moves money.
- Per-task cap (`SETTLE_MAX_USDC`) + a treasury-balance gate bound every payout.

## To take Arc LIVE (provisioning checklist)

1. A Circle/Arc **testnet account** → the Arc-testnet **USDC contract** (`USDC_ARC`).
2. A **Circle Gateway** (or Arc-capable x402) facilitator URL → `X402_FACILITATOR_URL`.
3. A **funded Arc test wallet** for the treasury payer.

Then `network: 'arc-sepolia'` on a task settles live over Arc — that's C2.

# Settlement architecture — x402 rails (Base + Arc) + Circle W3S wallets

GOAL C. handoff settles verified task payouts in **USDC** via two complementary mechanisms:

1. **x402 rail** (EIP-3009 `transferWithAuthorization`) — the broker's default settlement,
   per-task and rail-agnostic: the spender picks the `network` on the task's payment and
   settlement runs on that chain. **base-sepolia** is the default; **arc-sepolia** is a second,
   env-gated x402 rail (**C1**, money-safe — off until provisioned).
2. **Circle W3S Programmable Wallets** — the Arc/Circle sponsor integration (**C2**): each agent
   holds a Circle *developer-controlled* wallet, and a verified task triggers a **real USDC
   transfer** between agents via Circle's W3S API. The reusable client lives in `impute/circle`;
   the broker wiring lives in handoff behind a money-safe flag.

## Flow (per verified task)

```
 builder submits work ──> verify_task (orchestrator signs off)
        │                        │
        │                  task.status = verified
        ▼                        ▼
 ZSP capability burns      settler routes the payout
 (impute Tier-2)                 │
                    ┌────────────┼───────────────────────┐
                    ▼            ▼                         ▼
           base-sepolia     arc-sepolia            CIRCLE_W3S_LIVE=1
           (default x402)   (env x402, C1)         (Circle W3S, C2)
                    │            │                         │
                    ▼            ▼                         ▼
        EIP-3009 transferWithAuthorization        CircleW3SClient.transfer()
                    │            │                  (agent wallet → agent wallet)
                    └─────┬──────┘                         │
                          ▼                                ▼
                   on-chain USDC tx                 Circle transfer id + tx hash
                          └────────────┬───────────────────┘
                                       ▼
                       receipt (tx id) -> task.paid + notification.payment
```

## Rails / mechanisms

| Mechanism | network | USDC token | How it moves | Status |
|---|---|---|---|---|
| **Base** x402 (default) | `base-sepolia` | `0x036CbD…` (testnet) | public x402.org facilitator | live |
| **Arc** x402 (C1) | `arc-sepolia` (`ARC_NETWORK`) | `USDC_ARC` (env) | `X402_FACILITATOR_URL` | env-gated, money-safe — off until provisioned |
| **Circle W3S** (C2) | `ETH-SEPOLIA` (Circle) | Circle-managed testnet USDC | `impute/circle` W3S transfer API | client built + key-verified; live tx behind `CIRCLE_W3S_LIVE` |

The C1 arc-sepolia rail was a one-line, **money-safe** registry entry (`src/payments.ts
buildRequirements`): env-driven so no token address is ever guessed, inert until `USDC_ARC` is
set. The settler, EIP-3009 signing, and receipt path are rail-agnostic — they key off the
task's `network`.

## Circle W3S Programmable Wallets (C2 — the built Circle integration)

`impute/circle` (`CircleW3SClient`) is a zero-dependency client (`fetch` + `node:crypto` only)
for Circle's developer-controlled wallets:

- **Entity secret.** A 32-byte secret authorizes wallet operations. Every state-changing call
  carries a *fresh* RSA-OAEP-SHA256 ciphertext of it (`freshCiphertext()`) — Circle rejects a
  reused ciphertext, so it is never cached (the RSA public key is cached; the ciphertext is not).
- **Agent wallets.** `createWalletSet` + `createWallets(['ETH-SEPOLIA'])` give each agent a
  developer-controlled wallet; `faucetDrip` funds it with testnet USDC + gas.
- **Settle.** `transfer({ walletId, destinationAddress, tokenId, amount })` moves USDC
  agent→agent; `waitForTx` polls to the on-chain tx hash.
- **De-risk.** `examples/circle-live.mjs` runs the whole flow standalone
  (gen → register → wallets → faucet → transfer → txHash), proving the fiddly entity-secret
  dance **before** any broker wiring.

### One-time setup — entity-secret registration (Console only)
Circle registers the entity secret **only via the Developer Console** — the API route was
removed (a `createWallet` with an unregistered secret returns `code 156016: "provide encrypted
ciphertext in the console"`). The client generates the 32-byte secret *and* its registration
ciphertext; you paste the ciphertext once into the Circle Console and download the recovery
file. Thereafter the client mints fresh per-call ciphertexts automatically.

## Money-safe posture

- **Testnet only.** No live fund movement without an explicit key **and** the rail's env set.
  x402 auto-settlement falls back to a 402 (verifier signs) when no treasury payer is
  configured — verification never silently moves money.
- The **Circle W3S** rail moves real (testnet) USDC, so the broker wiring is gated behind
  **`CIRCLE_W3S_LIVE`** (off by default) — the same paper-by-default posture as
  faucet / contracts / polymarket. Nothing settles over Circle until the flag is explicitly on.
- Per-task cap (`SETTLE_MAX_USDC`) + a treasury/wallet-balance gate bound every payout.

## To take the Circle W3S rail LIVE (provisioning checklist)

1. A Circle **W3S testnet API key** in `ENV:ID:SECRET` form
   (`CIRCLE_API_TESTNET_KEY=TEST_API_KEY:<id>:<secret>`).
2. **Register the entity secret once** via the Circle Console (paste the client-generated
   ciphertext; keep the recovery file). Store the 32-byte secret as `CIRCLE_ENTITY_SECRET`.
3. Create agent wallets (`createWallets`) and fund them (`faucetDrip`).
4. Set **`CIRCLE_W3S_LIVE=1`** to enable the `verify_task → transfer` wiring.

Then a verified task settles a real USDC transfer between agent wallets — that is C2.

> The original Arc design also contemplated **Circle Gateway as an x402 facilitator**
> (`X402_FACILITATOR_URL`) for gasless EIP-3009 settlement on arc-sepolia (the C1 rail). That
> path remains valid and money-safe; the W3S client above is the integration that is built and
> key-verified for the live demo.

// Standalone de-risk of the Circle W3S settlement flow (C2): entity-secret →
// developer-controlled wallets → testnet faucet → a REAL USDC transfer on
// ETH-SEPOLIA, captured as an on-chain tx hash. Run this BEFORE wiring Circle
// into the broker — the entity-secret/ciphertext dance is the only fiddly part,
// and this proves it in isolation. Money-safe: testnet faucet USDC only.
//
//   CIRCLE_API_TESTNET_KEY=TEST_API_KEY:ID:SECRET \
//   [CIRCLE_ENTITY_SECRET=<hex>] \           # set on re-runs (entity secret is one-time-registered per account)
//   node examples/circle-live.mjs
import { writeFileSync } from 'node:fs';
import { CircleW3SClient, generateEntitySecret } from '../dist/src/circle/index.js';

const apiKey = process.env.CIRCLE_API_TESTNET_KEY;
if (!apiKey) { console.error('set CIRCLE_API_TESTNET_KEY (TEST_API_KEY:ID:SECRET)'); process.exit(1); }
const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN ?? 'ETH-SEPOLIA';
const step = (n, m) => console.log(`\n[${n}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const needsRegister = !entitySecret;
if (!entitySecret) entitySecret = generateEntitySecret();
const client = new CircleW3SClient({ apiKey, entitySecret });

step(0, 'fetch entity public key (auth check)');
const pem = await client.getPublicKey();
console.log('  publicKey OK:', pem.slice(0, 36).replace(/\n/g, '') + '…');

step(1, 'entity secret');
if (needsRegister) {
  try {
    const { recoveryFile } = await client.registerEntitySecret();
    console.log('  REGISTERED. >>> SAVE THIS: CIRCLE_ENTITY_SECRET=' + entitySecret);
    if (recoveryFile) { writeFileSync('/tmp/circle-recovery.dat', recoveryFile); console.log('  recovery file -> /tmp/circle-recovery.dat'); }
  } catch (e) {
    if (/already|exist/i.test(e.message)) { console.error('  entity secret ALREADY registered for this account — rerun with CIRCLE_ENTITY_SECRET=<the original>'); process.exit(3); }
    throw e;
  }
} else {
  console.log('  using CIRCLE_ENTITY_SECRET from env (assumed already registered)');
}

step(2, 'create wallet set');
const ws = await client.createWalletSet('impute-c2-' + Date.now());
console.log('  walletSet:', ws.id);

step(3, `create 2 wallets on ${BLOCKCHAIN}`);
const wallets = await client.createWallets(ws.id, [BLOCKCHAIN], 2);
const [payer, payee] = wallets;
console.log('  payer:', payer.id, payer.address);
console.log('  payee:', payee.id, payee.address);

step(4, 'faucet drip payer (USDC + native gas)');
await client.faucetDrip(payer.address, BLOCKCHAIN);
console.log('  drip requested');

step(5, 'poll payer balances for USDC');
let usdc = null;
for (let i = 0; i < 40; i++) {
  const bals = await client.getBalances(payer.id);
  usdc = bals.find((b) => (b.symbol || '').toUpperCase().includes('USDC') && parseFloat(b.amount) > 0);
  if (usdc) { console.log('  USDC landed:', usdc.amount, '(tokenId ' + usdc.tokenId + ')'); break; }
  process.stdout.write('.');
  await sleep(5000);
}
if (!usdc) { console.error('\n  USDC never arrived from faucet (rate-limited? try again)'); process.exit(2); }

step(6, 'transfer 0.01 USDC payer → payee');
const tr = await client.transfer({ walletId: payer.id, destinationAddress: payee.address, tokenId: usdc.tokenId, amount: '0.01' });
console.log('  transfer id:', tr.id, '| state:', tr.state);

step(7, 'wait for on-chain tx hash');
const done = await client.waitForTx(tr.id, { timeoutMs: 150000 });
console.log('  final state:', done.state);
if (done.txHash) {
  console.log('  ✓ TX HASH:', done.txHash);
  console.log('  explorer: https://sepolia.etherscan.io/tx/' + done.txHash);
} else {
  console.log('  (no tx hash yet — still settling; transfer id:', tr.id + ')');
}

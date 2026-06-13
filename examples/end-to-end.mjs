import crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import {
  generateAgentKeyPair,
  publicIdentity,
  produceQuote,
  verifyQuote,
  mintZspToken,
  authorizeZspToken,
  deriveMacKey,
  tag,
  verifyTag,
  buildApprovalMessage,
  verifyHumanApproval,
  requiresApproval,
  HUMAN_SCHEME
} from 'impute';

// ANSI escape codes for beautiful styling
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';

function section(title) {
  console.log(`\n${BOLD}${MAGENTA}=== ${title} ===${RESET}`);
}

function mockSection(title) {
  console.log(`\n${BOLD}${YELLOW}--- MOCK: ${title} ---${RESET}`);
}

function logStep(step, detail, status = 'OK') {
  const statusStr = status === 'OK' ? `${GREEN}✔ PASS${RESET}` : `${YELLOW}⚠ ${status}${RESET}`;
  console.log(`  [${statusStr}] ${BOLD}${step}${RESET}: ${detail}`);
}

console.log(`${BOLD}${CYAN}------------------------------------------------------------`);
console.log(`     IMPUTE PROTOCOL: EXTENDED END-TO-END DEMO SCRIPT`);
console.log(`------------------------------------------------------------${RESET}`);

// --- TIER 0: Human Consent (hardware root of intent) ---
section('TIER 0: Human Consent (Hardware Wallet Root of Intent)');

// Anvil private key representing the human's Ledger device
const ledgerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const humanLedger = privateKeyToAccount(ledgerPrivateKey);
logStep('Ledger Wallet', `Connected Ledger human address: ${humanLedger.address}`);

const NOW = Math.floor(Date.now() / 1000);
const spawnPayload = {
  action: 'spawn_agent',
  subject: 'handoff-antigrav-agent-v1',
  nonce: crypto.randomBytes(8).toString('hex'),
  exp: NOW + 300 // valid for 5 mins
};

logStep('Build Payload', `Created spawn_agent approval payload`);
const approvalMessage = buildApprovalMessage(spawnPayload);
console.log(`${BOLD}${CYAN}---- CLEAR-SIGN MESSAGE ON LEDGER DEVICE ----\n${RESET}${approvalMessage}\n${BOLD}${CYAN}---------------------------------------------${RESET}`);

const humanSig = await humanLedger.signMessage({ message: approvalMessage });
logStep('Sign Message', `Clear-signed approval signature generated on Ledger (Scheme: 0x00)`);

const humanVerify = await verifyHumanApproval(spawnPayload, humanSig, humanLedger.address, { now: NOW });
if (humanVerify.ok) {
  logStep('Verify Consent', `Human approval signature recovered humanLedger address successfully.`);
} else {
  throw new Error(`Human consent verification failed: ${humanVerify.reason}`);
}


// --- TIER 1: Agent Key Pair & Identity ---
section('TIER 1: Agent Cryptographic Identity & TEE Attestation');

const keyPair = generateAgentKeyPair('ml-dsa-65');
const id = publicIdentity(keyPair);
logStep('Key Generation', `Agent generated post-quantum ML-DSA-65 keys`);
logStep('Fingerprint', `Agent identity fingerprint: ${id.fingerprint}`);

const nonce = crypto.randomBytes(16);
const quote = produceQuote(id.fingerprint, { nonce });
logStep('TEE Attestation', `Generated mock SGX/TDX quote for fingerprint`);

const attestationResult = verifyQuote(quote, { fingerprint: id.fingerprint, nonce });
if (attestationResult.ok) {
  logStep('Quote Verification', `Quote signature verified. Enclave measurement bound successfully.`);
} else {
  throw new Error(`Attestation verification failed: ${attestationResult.reason}`);
}


// --- MOCK: ENS & ERC-8004 Registry Publication ---
mockSection('ENS Subname & ERC-8004 Registry Publication');

logStep('ENS Subname', `Registering subname: "antigrav.handoff.eth"`);
logStep('ENS Text Records', `Publishing ML-DSA fingerprint (${id.fingerprint.slice(0, 8)}...) to resolver`);
logStep('ERC-8004 Registry', `Emitted ERC-8004 IdentityPublished event on-chain for fingerprint`);


// --- TIER 2: Zero-Standing-Privilege Token ---
section('TIER 2: Zero-Standing-Privilege (ZSP) Capability Gating');

const scope = ['claim_task', 'update_task', 'submit_result'];
const audience = 'handoff-broker';

const capability = mintZspToken(keyPair, {
  aud: audience,
  scope,
  ttlSeconds: 300,
  nbf: NOW
});
logStep('Mint Capability', `Minted ZSP token scoped for [${scope.join(', ')}]`);
logStep('Token JTI', `Token UUID (JTI): ${capability.token.jti}`);

const authResult = authorizeZspToken(capability, {
  action: 'submit_result',
  aud: audience,
  now: NOW + 10
});
if (authResult.ok) {
  logStep('Authorize Action', `Authorized action "submit_result" on audience "${audience}"`);
} else {
  throw new Error(`Authorization failed: ${authResult.reason}`);
}

const rejectResult = authorizeZspToken(capability, {
  action: 'destroy_database',
  aud: audience,
  now: NOW + 10
});
logStep('Out-of-Scope Reject', `Attempting unauthorized action "destroy_database" rejected: "${rejectResult.reason}"`);


// --- TIER 3: Blake3 Keyed Execution MAC ---
section('TIER 3: Blake3 Keyed Micro-Action Execution MAC');

// Establish the shared 32-byte secret key associated with the ZSP session
const tokenSecret = crypto.randomBytes(32);
logStep('Token Secret', `Established shared ZSP token secret (32 bytes)`);

// Derive the MAC key bound to this specific token's JTI
const macKey = deriveMacKey(tokenSecret, capability.token.jti);
logStep('Derive MAC Key', `Derived Blake3 MAC key (bound to JTI: ${capability.token.jti.slice(0, 8)}...)`);

// Message describing the micro-action to authorize (e.g. payout authorization)
const microActionMessage = new TextEncoder().encode('action: execute_payout_settlement: 250.00 USDC');
const executionTag = tag(macKey, microActionMessage);
logStep('Generate MAC', `Tagged action message with Blake3-160 execution MAC (20 bytes)`);

// Verify tag
const verifySuccess = verifyTag(macKey, microActionMessage, executionTag);
if (verifySuccess) {
  logStep('Verify MAC', `Execution MAC verified successfully. Micro-action is authenticated.`);
} else {
  throw new Error(`Micro-action MAC verification failed`);
}


// --- MOCK: Arc x402 USDC Settlement (EIP-3009 Gasless) ---
mockSection('Arc x402 USDC Settlement & Threshold Escrow Payout');

const settlementAmount = 250.00;
const threshold = 100.00;
logStep('Escrow Settlement', `Requesting settlement payout of ${settlementAmount} USDC (Threshold: ${threshold} USDC)`);

// Check if payout requires human approval (Tier-0 threshold check)
const isApprovalRequired = requiresApproval('settle_above_threshold', settlementAmount, threshold);
if (isApprovalRequired) {
  logStep('Threshold Gate', `Payout exceeds threshold. Tier-0 Human Approval REQUIRED.`, 'WARNING');
  
  const payoutPayload = {
    action: 'settle_above_threshold',
    subject: '0x48578036769Aa7caB54c004Baf0683A7983BE9D9', // antigrav wallet
    amount: settlementAmount.toFixed(2),
    nonce: crypto.randomBytes(8).toString('hex'),
    exp: NOW + 300
  };
  
  const payoutMsg = buildApprovalMessage(payoutPayload);
  console.log(`${BOLD}${CYAN}---- CLEAR-SIGN SETTLEMENT ON LEDGER DEVICE ----\n${RESET}${payoutMsg}\n${BOLD}${CYAN}------------------------------------------------${RESET}`);
  
  const payoutSig = await humanLedger.signMessage({ message: payoutMsg });
  logStep('Sign Payout', `Clear-signed settlement approval signature generated on Ledger`);
  
  const verifyPayout = await verifyHumanApproval(payoutPayload, payoutSig, humanLedger.address, { now: NOW });
  if (verifyPayout.ok) {
    logStep('Verify Payout', `Settlement approval signature recovered humanLedger successfully.`);
  } else {
    throw new Error(`Payout approval verification failed`);
  }
}

logStep('Arc Settle Rail', `Dispatched gasless EIP-3009 transfer on Base/Arc testnet`);
logStep('Tx Receipt', `Settled transaction ID: 0xde045fa403b22cf908b1a28a2a1296c66c3deba24a4d5cfcb6b78690d5656129`);


// --- MOCK: BigQuery Reputation Update ---
mockSection('BigQuery Reputation Engine & Explorer Update');

logStep('Reputation Query', `Indexing E2E task PASS receipt for agent ${id.fingerprint.slice(0, 8)}...`);
logStep('Reputation Score', `Agent reputation updated: 1.00 (100% success rate, 1 verified tasks)`);
logStep('Dashboard Update', `Streamlit explorer updated with new identity & verified reputation audit trail`);

console.log(`\n${BOLD}${GREEN}✔ Full end-to-end Impute flow (Tier-0 to Tier-3) demo completed successfully!${RESET}\n`);


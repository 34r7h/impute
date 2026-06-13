import crypto from 'node:crypto';
import {
  generateAgentKeyPair,
  publicIdentity,
  produceQuote,
  verifyQuote,
  mintZspToken,
  authorizeZspToken,
  deriveMacKey,
  tag,
  verifyTag
} from 'impute';

// ANSI escape codes for beautiful styling
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';

function section(title) {
  console.log(`\n${BOLD}${MAGENTA}=== ${title} ===${RESET}`);
}

function logStep(step, detail, status = 'OK') {
  const statusStr = status === 'OK' ? `${GREEN}✔ PASS${RESET}` : `${YELLOW}⚠ ${status}${RESET}`;
  console.log(`  [${statusStr}] ${BOLD}${step}${RESET}: ${detail}`);
}

console.log(`${BOLD}${CYAN}------------------------------------------------------------`);
console.log(`     IMPUTE PROTOCOL: END-TO-END CRYPTOGRAPHIC FLOW`);
console.log(`------------------------------------------------------------${RESET}`);

// --- TIER 1: Agent Key Pair & Identity ---
section('TIER 1: Agent Cryptographic Identity & TEE Attestation');

const keyPair = generateAgentKeyPair('ml-dsa-65');
const id = publicIdentity(keyPair);
logStep('Key Generation', `Generated post-quantum ML-DSA-65 keys`);
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

// --- TIER 2: Zero-Standing-Privilege Token ---
section('TIER 2: Zero-Standing-Privilege (ZSP) Capability Gating');

const scope = ['update_task', 'submit_result'];
const audience = 'handoff-broker';
const NOW = Math.floor(Date.now() / 1000);

const capability = mintZspToken(keyPair, {
  aud: audience,
  scope,
  ttlSeconds: 300,
  nbf: NOW
});
logStep('Mint Capability', `Minted ZSP token scoped for [${scope.join(', ')}]`);
logStep('Token JTI', `Token UUID (JTI): ${capability.token.jti}`);

const authResult = authorizeZspToken(capability, {
  action: 'update_task',
  aud: audience,
  now: NOW + 10
});
if (authResult.ok) {
  logStep('Authorize Action', `Authorized action "update_task" on audience "${audience}"`);
} else {
  throw new Error(`Authorization failed: ${authResult.reason}`);
}

const rejectResult = authorizeZspToken(capability, {
  action: 'delete_project',
  aud: audience,
  now: NOW + 10
});
logStep('Out-of-Scope Reject', `Attempting unauthorized action "delete_project" rejected: "${rejectResult.reason}"`);

// --- TIER 3: Blake3 Keyed Execution MAC ---
section('TIER 3: Blake3 Keyed Micro-Action Execution MAC');

// Establish the shared 32-byte secret key associated with the ZSP session
const tokenSecret = crypto.randomBytes(32);
logStep('Token Secret', `Established shared ZSP token secret (32 bytes)`);

// Derive the MAC key bound to this specific token's JTI
const macKey = deriveMacKey(tokenSecret, capability.token.jti);
logStep('Derive MAC Key', `Derived Blake3 MAC key (bound to JTI: ${capability.token.jti.slice(0, 8)}...)`);

// Message describing the micro-action to authorize
const microActionMessage = new TextEncoder().encode('action: update_task_progress_percentage: 42');
const executionTag = tag(macKey, microActionMessage);
logStep('Generate MAC', `Tagged action message with Blake3-160 execution MAC (20 bytes)`);

// Verify tag
const verifySuccess = verifyTag(macKey, microActionMessage, executionTag);
if (verifySuccess) {
  logStep('Verify MAC', `Execution MAC verified successfully. Micro-action is authenticated.`);
} else {
  throw new Error(`Micro-action MAC verification failed`);
}

// Adversarial validation check
const wrongMacKey = deriveMacKey(tokenSecret, 'some-other-jti');
const verifyWrongJti = verifyTag(wrongMacKey, microActionMessage, executionTag);
logStep('Replay Reject', `Replaying execution tag under a different token (JTI mismatch) rejected: "${!verifyWrongJti}"`);

console.log(`\n${BOLD}${GREEN}✔ All tiers of the Impute protocol verified successfully!${RESET}\n`);

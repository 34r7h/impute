// Browser entry: the impute surface the in-app Tier-0 demo needs (no node:crypto paths).
export { buildApprovalMessage, verifyHumanApproval } from './dist/src/tier0.js';
export { generateAgentKeyPair, publicIdentity } from './dist/src/keys.js';
export { mintZspToken, authorizeZspToken } from './dist/src/zsp.js';
export { buildManagerDelegation, buildAgentIssuance, verifyDelegationChain } from './dist/src/delegation/index.js';
export { createCustodialKey, signWithCustodialKey } from './dist/src/custodial/index.js';
export { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

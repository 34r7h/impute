// LIVE reputation -> ERC-8004 -> BigQuery. A client gives on-chain feedback to our agent on the
// canonical Sepolia ReputationRegistry (giveFeedback), we index it into handoff-499317.impute.reputation,
// and query it with the service account — proving the BigQuery half is REAL (not "off / []").
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'node:fs';

const ENV = '/Users/34r7h/Developer/projects/handoff/.env';
const SA = '/Users/34r7h/Developer/projects/handoff/.handoff_googlecloud_serviceaccount.json';
const env = (k) => { for (const l of readFileSync(ENV, 'utf8').split('\n')) { const m = l.match(new RegExp('^' + k + '=(.*)$')); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); } return ''; };
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const owner = mnemonicToAccount(env('SOCNETSEED'));    // 0xDA5D — owns agent 6568
const client = mnemonicToAccount(env('TREASURYSEED')); // 0xE43a — a CLIENT rating the agent
const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const ownerWc = createWalletClient({ account: owner, chain: sepolia, transport: http(RPC) });
const clientWc = createWalletClient({ account: client, chain: sepolia, transport: http(RPC) });
const REP = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const AGENT_ID = 6568n, FINGERPRINT = '1b8da73ceaf24fb9ab90bc7594992d1ec5af1553';

// 1) ensure the client has gas
const bal = await pc.getBalance({ address: client.address });
console.log('client', client.address, 'balance', Number(bal) / 1e18, 'ETH');
if (bal < parseEther('0.002')) { const g = await ownerWc.sendTransaction({ to: client.address, value: parseEther('0.004') }); await pc.waitForTransactionReceipt({ hash: g }); console.log('gassed client (tx ' + g.slice(0, 12) + '…)'); }

// 2) on-chain feedback: client -> agent, on the canonical ERC-8004 ReputationRegistry
const abi = [{ name: 'giveFeedback', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'int128' }, { type: 'uint8' }, { type: 'string' }, { type: 'string' }, { type: 'string' }, { type: 'string' }, { type: 'bytes32' }], outputs: [] }];
const { request } = await pc.simulateContract({ account: client, address: REP, abi, functionName: 'giveFeedback', args: [AGENT_ID, 100n, 0, 'verified-task', 'handoff', '', '', ('0x' + '00'.repeat(32))] });
const fbTx = await clientWc.writeContract(request);
await pc.waitForTransactionReceipt({ hash: fbTx });
console.log('✓ on-chain feedback to agent', AGENT_ID.toString(), '-> https://sepolia.etherscan.io/tx/' + fbTx);

// 3) index into BigQuery (service-account auth) + query it back
const bq = new BigQuery({ projectId: 'handoff-499317', keyFilename: SA });
await bq.query({ query: 'CREATE TABLE IF NOT EXISTS `handoff-499317.impute.reputation` (idBlob STRING, agentId INT64, client STRING, score FLOAT64, tag STRING, tx STRING, ts TIMESTAMP)' });
await bq.query({ query: `INSERT INTO \`handoff-499317.impute.reputation\` (idBlob, agentId, client, score, tag, tx, ts) VALUES ('${FINGERPRINT}', ${AGENT_ID}, '${client.address}', 100.0, 'verified-task', '${fbTx}', CURRENT_TIMESTAMP())` });
console.log('✓ indexed the feedback into handoff-499317.impute.reputation');
const [rows] = await bq.query({ query: `SELECT idBlob AS fingerprint, COUNT(*) AS verifiedTaskCount, AVG(score) AS score FROM \`handoff-499317.impute.reputation\` WHERE idBlob='${FINGERPRINT}' GROUP BY idBlob` });
console.log('\n✓✓ BigQuery reputation LIVE — query (service-account authed) returns:');
console.log(JSON.stringify(rows, null, 1));

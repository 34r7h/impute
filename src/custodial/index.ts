/**
 * Custodial Tier-0 signer — the fallback when the human has neither a Ledger nor a browser/QR
 * wallet. A secp256k1 key is generated and stored ENCRYPTED AT REST with the user's handoff
 * password: scrypt (memory-hard KDF) → AES-256-GCM (authenticated). The plaintext key exists only
 * in memory during a single sign and is wiped after. The password is never stored; a wrong
 * password fails the GCM auth tag (cannot decrypt). It produces the same scheme-0x00 secp256k1
 * signature as a Ledger/wallet, so `verifyHumanApproval` accepts it identically.
 *
 * Security posture: as safe as a custodial scheme gets — equivalent to a Web3 Secret Storage
 * keystore. It is strictly the LAST resort; prefer Ledger > wallet > custodial.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { scryptAsync } from '@noble/hashes/scrypt';
import { type Hex } from '../types.js';

export interface EncryptedKeystore {
  address: Hex;
  kdf: 'scrypt';
  params: { N: number; r: number; p: number; dkLen: number };
  salt: string;        // hex
  iv: string;          // hex (AES-GCM nonce)
  ciphertext: string;  // hex (AES-GCM output incl. auth tag)
}

const SCRYPT = { N: 1 << 17, r: 8, p: 1, dkLen: 32 } as const;
const toHex = (u8: Uint8Array) => Array.from(u8, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
const bs = (u8: Uint8Array): BufferSource => u8 as unknown as BufferSource;

async function aesKeyFromPassword(password: string, salt: Uint8Array, p: EncryptedKeystore['params']): Promise<CryptoKey> {
  const dk = await scryptAsync(new TextEncoder().encode(password.normalize('NFKC')), salt, p);
  return globalThis.crypto.subtle.importKey('raw', bs(dk), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Generate a fresh custodial Tier-0 key and return its address + a password-encrypted keystore. */
export async function createCustodialKey(password: string): Promise<{ address: Hex; keystore: EncryptedKeystore }> {
  if (!password || password.length < 8) throw new Error('password too short (min 8)');
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address as Hex;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await aesKeyFromPassword(password, salt, SCRYPT);
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, aesKey, bs(fromHex(pk.slice(2)))));
  return { address, keystore: { address, kdf: 'scrypt', params: SCRYPT, salt: toHex(salt), iv: toHex(iv), ciphertext: toHex(ct) } };
}

/** Decrypt the custodial key with the password and sign `message` (EIP-191). Plaintext key is wiped after. */
export async function signWithCustodialKey(keystore: EncryptedKeystore, password: string, message: string): Promise<Hex> {
  const aesKey = await aesKeyFromPassword(password, fromHex(keystore.salt), keystore.params);
  let pkBytes: Uint8Array;
  try {
    pkBytes = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(fromHex(keystore.iv)) }, aesKey, bs(fromHex(keystore.ciphertext))));
  } catch {
    throw new Error('bad-password'); // GCM auth-tag failure = wrong password (or tampered keystore)
  }
  const account = privateKeyToAccount(`0x${toHex(pkBytes)}`);
  const sig = await account.signMessage({ message });
  pkBytes.fill(0); // wipe plaintext key from memory
  return sig as Hex;
}

// lib/wallet.ts
// Wallet creation/import and secure persistence.

import * as SecureStore from 'expo-secure-store';
import { HDKey } from '@scure/bip32';
import {
  generateMnemonic as generateBip39Mnemonic,
  mnemonicToSeedSync,
  validateMnemonic as validateBip39Mnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3';
import { DERIVATION_PATH } from '@/constants/chains';

export type Hex = `0x${string}`;

const SECURE_KEYS = {
  SEED_PHRASE: 'tpay_seed_phrase_v1',
  PRIVATE_KEY: 'tpay_private_key_v1',
} as const;

export interface WalletInfo {
  address: `0x${string}`;
  privateKey: Hex;
  mnemonic?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hexNoPrefix: string): Uint8Array {
  if (hexNoPrefix.length % 2 !== 0) {
    throw new Error('Invalid hex length.');
  }
  const out = new Uint8Array(hexNoPrefix.length / 2);
  for (let i = 0; i < hexNoPrefix.length; i += 2) {
    const byte = Number.parseInt(hexNoPrefix.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex string.');
    }
    out[i / 2] = byte;
  }
  return out;
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}

function checksumAddress(lowerHexNoPrefix: string): `0x${string}` {
  const hashHex = bytesToHex(new Uint8Array(keccak_256(new TextEncoder().encode(lowerHexNoPrefix))));
  let out = '0x';
  for (let i = 0; i < lowerHexNoPrefix.length; i++) {
    const ch = lowerHexNoPrefix[i];
    out += Number.parseInt(hashHex[i], 16) >= 8 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out as `0x${string}`;
}

function addressFromPrivateKeyBytes(privateKeyBytes: Uint8Array): `0x${string}` {
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyWithoutPrefix = publicKey.slice(1);
  const hash = keccak_256(publicKeyWithoutPrefix);
  const addressLower = bytesToHex(hash.slice(-20));
  return checksumAddress(addressLower);
}

export async function createNewWallet(): Promise<WalletInfo> {
  const mnemonic = generateBip39Mnemonic(wordlist, 128);
  return deriveFromMnemonic(mnemonic);
}

export async function deriveFromMnemonic(mnemonic: string): Promise<WalletInfo> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateBip39Mnemonic(normalized, wordlist)) {
    throw new Error('Invalid seed phrase. Please check each word and try again.');
  }

  // MetaMask-compatible path: m/44'/60'/0'/0/0
  const seed = mnemonicToSeedSync(normalized);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(DERIVATION_PATH);
  if (!child.privateKey) {
    throw new Error('Key derivation failed: no private key produced.');
  }

  const privateKey = `0x${bytesToHex(child.privateKey)}` as Hex;
  const address = addressFromPrivateKeyBytes(child.privateKey);

  return {
    address,
    privateKey,
    mnemonic: normalized,
  };
}

export async function importFromPrivateKey(rawKey: string): Promise<WalletInfo> {
  const normalized = rawKey.trim().toLowerCase();
  const hex = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
  if (!/^0x[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Invalid private key. Must be 64 hex characters.');
  }

  const privateKeyBytes = hexToBytes(hex.slice(2));
  const address = addressFromPrivateKeyBytes(privateKeyBytes);

  return {
    address,
    privateKey: hex as Hex,
  };
}

export async function saveWalletSecurely(wallet: WalletInfo): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.PRIVATE_KEY, wallet.privateKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (wallet.mnemonic) {
    await SecureStore.setItemAsync(SECURE_KEYS.SEED_PHRASE, wallet.mnemonic, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export async function loadPrivateKey(): Promise<Hex | null> {
  const key = await SecureStore.getItemAsync(SECURE_KEYS.PRIVATE_KEY);
  return key as Hex | null;
}

export async function loadSeedPhrase(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.SEED_PHRASE);
}

export async function hasWallet(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(SECURE_KEYS.PRIVATE_KEY);
  return key !== null;
}

export async function wipeWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.PRIVATE_KEY);
  await SecureStore.deleteItemAsync(SECURE_KEYS.SEED_PHRASE);
}

export function validateMnemonic(mnemonic: string): boolean {
  return validateBip39Mnemonic(normalizeMnemonic(mnemonic), wordlist);
}

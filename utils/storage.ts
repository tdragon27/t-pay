// utils/storage.ts
// -----------------------------------------------------------------------------
// Thin wrapper around AsyncStorage for non-sensitive user data.
// Sensitive data (keys, seed) must use lib/wallet.ts ? SecureStore.
// -----------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

const KEYS = STORAGE_KEYS;

// -- Wallet address (public ? safe in AsyncStorage) ----------------------------
export async function saveAddress(address: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.WALLET_ADDRESS, address);
}

export async function loadAddress(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.WALLET_ADDRESS);
}

// -- Onboarding state ----------------------------------------------------------
export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, '1');
}

export async function isOnboardingComplete(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return v === '1';
}

// -- Transaction cache (recent tx list) ---------------------------------------
export interface CachedTransaction {
  hash: string;
  from: string;
  to: string;
  value: string; // USDC amount as string
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  type: 'send' | 'receive' | 'bridge';
}

export async function saveCachedTransactions(
  address: string,
  txs: CachedTransaction[]
): Promise<void> {
  await AsyncStorage.setItem(
    `${KEYS.TRANSACTION_CACHE}_${address.toLowerCase()}`,
    JSON.stringify(txs.slice(0, 50)) // keep last 50
  );
}

export async function loadCachedTransactions(
  address: string
): Promise<CachedTransaction[]> {
  const raw = await AsyncStorage.getItem(
    `${KEYS.TRANSACTION_CACHE}_${address.toLowerCase()}`
  );
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CachedTransaction[];
  } catch {
    return [];
  }
}

// -- App settings --------------------------------------------------------------
export interface AppSettings {
  haptics: boolean;
  hideBalance: boolean;
  network: 'testnet' | 'mainnet';
  currency: 'USD' | 'EUR';
}

const DEFAULT_SETTINGS: AppSettings = {
  haptics: true,
  hideBalance: false,
  network: 'testnet',
  currency: 'USD',
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await loadSettings();
  await AsyncStorage.setItem(
    KEYS.SETTINGS,
    JSON.stringify({ ...current, ...settings })
  );
}

// -- Clear all app data (full reset) -------------------------------------------
export async function clearAllStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const arcKeys = keys.filter((k) => k.startsWith('tpay_'));
  await AsyncStorage.multiRemove(arcKeys);
}


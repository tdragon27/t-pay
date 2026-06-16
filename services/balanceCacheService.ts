import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export interface BalanceCacheSnapshot {
  address: string;
  arcUsdc: string;
  totalUsdc: string;
  fiatUsd: number;
  fiatVnd: number;
  source: string;
  updatedAt: number;
}

function keyFor(address: string) {
  return `${STORAGE_KEYS.BALANCE_CACHE}_${address.toLowerCase()}`;
}

export async function saveBalanceCache(snapshot: BalanceCacheSnapshot) {
  await AsyncStorage.setItem(keyFor(snapshot.address), JSON.stringify({ ...snapshot, updatedAt: snapshot.updatedAt || Date.now() }));
}

export async function loadBalanceCache(address?: string | null): Promise<BalanceCacheSnapshot | null> {
  if (!address) return null;
  const raw = await AsyncStorage.getItem(keyFor(address));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BalanceCacheSnapshot;
  } catch {
    return null;
  }
}

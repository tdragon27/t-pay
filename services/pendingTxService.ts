import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export type PendingTxType = 'send' | 'swap' | 'bridge' | 'invoice' | 'market' | 'recurring';

export interface PendingTx {
  txHash: string;
  type: PendingTxType;
  createdAt: number;
  label: string;
  explorerUrl?: string;
  status: 'pending' | 'confirmed' | 'failed';
  metadata?: Record<string, string | number | boolean | undefined>;
}

export async function loadPendingTxs(): Promise<PendingTx[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_TXS);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as PendingTx[]).filter((tx) => tx.status === 'pending');
  } catch {
    return [];
  }
}

async function savePendingTxs(txs: PendingTx[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TXS, JSON.stringify(txs.slice(0, 100)));
}

export async function addPendingTx(tx: Omit<PendingTx, 'createdAt' | 'status'> & { createdAt?: number; status?: PendingTx['status'] }) {
  const current = await loadPendingTxs();
  const next: PendingTx = { ...tx, createdAt: tx.createdAt ?? Date.now(), status: tx.status ?? 'pending' };
  await savePendingTxs([next, ...current.filter((item) => item.txHash !== tx.txHash)]);
  return next;
}

export async function markPendingTx(txHash: string, status: PendingTx['status']) {
  const current = await loadPendingTxs();
  await savePendingTxs(current.map((tx) => tx.txHash === txHash ? { ...tx, status } : tx));
}

export function isStuck(tx: PendingTx, thresholdMs = 30_000) {
  return tx.status === 'pending' && Date.now() - tx.createdAt > thresholdMs;
}

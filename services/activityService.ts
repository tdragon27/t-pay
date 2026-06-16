import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import type { PaymentIntent } from '@/services/paymentIntentService';
import { activityDedupeKey, dedupeByActivityKey } from '@/utils/tpayLogic';

export type ActivityType = 'send' | 'receive' | 'split_payment' | 'merchant_invoice' | 'fx_swap' | 'bridge' | 'passport' | 'request';
export type ActivityDirection = 'incoming' | 'outgoing' | 'neutral';
export type ActivityStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled';
export type ActivitySourceFeature = 'send' | 'receive' | 'split' | 'merchant' | 'fx' | 'bridge' | 'passport' | 'request';
export type ActivityCreatedBy = 'user' | 'system' | 'agent';
export type ActivityRiskLevel = 'low' | 'medium' | 'high';

export interface UnifiedActivityItem {
  id: string;
  type: ActivityType;
  amount?: string;
  token?: string;
  direction: ActivityDirection;
  status: ActivityStatus;
  timestamp: number;
  txHash?: string;
  explorerUrl?: string;
  sourceFeature: ActivitySourceFeature;
  counterparty?: string;
  label: string;
  note?: string;
  paymentIntentId?: string;
  splitId?: string;
  participantId?: string;
  invoiceId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined> & {
    createdBy?: ActivityCreatedBy;
    permissionScope?: string;
    spendingLimit?: string;
    expiresAt?: number;
    sourceApp?: string;
    paymentPurpose?: string;
    riskLevel?: ActivityRiskLevel;
    policyNote?: string;
  };
}

const MAX_ACTIVITY = 260;
let idCounter = 0;

function makeId(type: ActivityType) {
  idCounter += 1;
  return `${type}_${Date.now()}_${idCounter}`;
}

export function arcExplorerTxUrl(txHash?: string) {
  if (!txHash) return undefined;
  const explorer = process.env.EXPO_PUBLIC_ARC_EXPLORER ?? ARC_TESTNET_DEFAULTS.EXPLORER_URL;
  return `${explorer}/tx/${txHash}`;
}

function withAgentReadyMetadata(metadata: UnifiedActivityItem['metadata']): UnifiedActivityItem['metadata'] {
  return {
    createdBy: 'user',
    riskLevel: 'low',
    sourceApp: 'T Pay',
    ...(metadata ?? {}),
  };
}

function normalizeStatus(status: string): ActivityStatus {
  if (status === 'success' || status === 'confirmed') return 'confirmed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

function normalizeItem(item: UnifiedActivityItem): UnifiedActivityItem {
  return {
    ...item,
    id: item.id || makeId(item.type),
    token: item.token ?? 'USDC',
    status: normalizeStatus(item.status),
    timestamp: item.timestamp || Date.now(),
    explorerUrl: item.explorerUrl ?? arcExplorerTxUrl(item.txHash),
    metadata: withAgentReadyMetadata(item.metadata),
  };
}

async function readRaw(): Promise<UnifiedActivityItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.UNIFIED_ACTIVITY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UnifiedActivityItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch {
    return [];
  }
}

async function writeRaw(items: UnifiedActivityItem[]) {
  const seen = new Set<string>();
  const next = [...items]
    .map(normalizeItem)
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((item) => {
      const key = activityDedupeKey(item.id, item.txHash);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ACTIVITY);
  await AsyncStorage.setItem(STORAGE_KEYS.UNIFIED_ACTIVITY, JSON.stringify(next));
}

export async function loadActivityItems(options?: { limit?: number; sourceFeature?: ActivitySourceFeature }) {
  const items = await readRaw();
  return items
    .filter((item) => !options?.sourceFeature || item.sourceFeature === options.sourceFeature)
    .slice(0, options?.limit ?? MAX_ACTIVITY);
}

export async function recordActivity(input: Omit<UnifiedActivityItem, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) {
  const item = normalizeItem({
    ...input,
    id: input.id ?? makeId(input.type),
    timestamp: input.timestamp ?? Date.now(),
  } as UnifiedActivityItem);
  const current = await readRaw();
  await writeRaw([item, ...current.filter((row) => row.id !== item.id)]);
  return item;
}

export async function updateActivity(id: string, patch: Partial<UnifiedActivityItem>) {
  const current = await readRaw();
  const existing = current.find((item) => item.id === id);
  if (!existing) return null;
  const next = normalizeItem({ ...existing, ...patch });
  await writeRaw([next, ...current.filter((item) => item.id !== id)]);
  return next;
}

export function activityFromPaymentIntent(intent: PaymentIntent, overrides?: Partial<UnifiedActivityItem>): UnifiedActivityItem {
  const isIncoming = overrides?.direction ?? (intent.senderWallet ? 'outgoing' : 'incoming');
  const sourceFeature: ActivitySourceFeature = intent.type === 'split' ? 'split' : intent.type === 'merchant' ? 'merchant' : intent.type === 'request' ? 'request' : 'send';
  const type: ActivityType = intent.type === 'split' ? 'split_payment' : intent.type === 'merchant' ? 'merchant_invoice' : intent.type === 'request' ? 'request' : 'send';
  return normalizeItem({
    id: overrides?.id ?? `intent_${intent.id}`,
    type,
    amount: intent.amount,
    token: intent.tokenSymbol,
    direction: isIncoming,
    status: normalizeStatus(intent.status),
    timestamp: intent.paidAt ?? intent.updatedAt ?? intent.createdAt,
    txHash: intent.txHash,
    explorerUrl: arcExplorerTxUrl(intent.txHash),
    sourceFeature,
    counterparty: intent.receiverWallet,
    label: intent.label ?? intent.note ?? `${intent.amount} ${intent.tokenSymbol}`,
    note: intent.note,
    paymentIntentId: intent.id,
    splitId: intent.splitId,
    participantId: intent.participantId,
    invoiceId: intent.invoiceId,
    ...overrides,
    metadata: withAgentReadyMetadata({
      createdBy: intent.createdBy ?? 'user',
      permissionScope: intent.permissionScope,
      spendingLimit: intent.spendingLimit,
      expiresAt: intent.expiresAt,
      sourceApp: intent.sourceApp ?? 'T Pay',
      paymentPurpose: intent.paymentPurpose,
      riskLevel: intent.riskLevel ?? 'low',
      policyNote: intent.policyNote,
      ...(overrides?.metadata ?? {}),
    }),
  });
}

export function mergeActivityItems(...groups: UnifiedActivityItem[][]) {
  return dedupeByActivityKey(groups.flat().map(normalizeItem));
}






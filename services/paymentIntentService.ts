import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';

export type PaymentIntentType = 'transfer' | 'split' | 'merchant' | 'request';
export type PaymentIntentStatus = 'draft' | 'pending' | 'confirmed' | 'failed' | 'cancelled';
export type PaymentIntentCreatedBy = 'user' | 'system' | 'agent';
export type PaymentIntentRiskLevel = 'low' | 'medium' | 'high';

export interface PaymentIntent {
  id: string;
  type: PaymentIntentType;
  amount: string;
  tokenSymbol: string;
  receiverWallet: `0x${string}`;
  senderWallet?: `0x${string}`;
  note?: string;
  label?: string;
  splitId?: string;
  participantId?: string;
  invoiceId?: string;
  chainId: number;
  txHash?: string;
  status: PaymentIntentStatus;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  failureReason?: string;
  createdBy?: PaymentIntentCreatedBy;
  permissionScope?: string;
  spendingLimit?: string;
  expiresAt?: number;
  sourceApp?: string;
  paymentPurpose?: string;
  riskLevel?: PaymentIntentRiskLevel;
  policyNote?: string;
}

export type PaymentIntentDraft = Omit<PaymentIntent, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'chainId'> & {
  id?: string;
  status?: PaymentIntentStatus;
  chainId?: number;
  createdAt?: number;
  updatedAt?: number;
};

const MAX_PAYMENT_INTENTS = 220;
let idCounter = 0;

function makeId(type: PaymentIntentType) {
  idCounter += 1;
  return `${type}_${Date.now()}_${idCounter}`;
}

function normalizeAmount(amount: string | number) {
  const parsed = Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return '0.00';
  return parsed.toFixed(6).replace(/\.0+$/, '.00').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.00');
}

function normalizeIntent(intent: PaymentIntent): PaymentIntent {
  return {
    ...intent,
    amount: normalizeAmount(intent.amount),
    tokenSymbol: intent.tokenSymbol || 'USDC',
    chainId: intent.chainId || Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? ARC_TESTNET_DEFAULTS.CHAIN_ID),
    updatedAt: intent.updatedAt ?? intent.createdAt,
    createdBy: intent.createdBy ?? 'user',
    riskLevel: intent.riskLevel ?? 'low',
    sourceApp: intent.sourceApp ?? 'T Pay',
  };
}

async function readRaw(): Promise<PaymentIntent[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_INTENTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PaymentIntent[];
    return Array.isArray(parsed) ? parsed.map(normalizeIntent) : [];
  } catch {
    return [];
  }
}

async function writeRaw(items: PaymentIntent[]) {
  const sorted = [...items]
    .map(normalizeIntent)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PAYMENT_INTENTS);
  await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_INTENTS, JSON.stringify(sorted));
}

export async function loadPaymentIntents(options?: {
  status?: PaymentIntentStatus;
  type?: PaymentIntentType;
  wallet?: string | null;
  limit?: number;
}) {
  const wallet = options?.wallet?.toLowerCase();
  const items = await readRaw();
  return items
    .filter((intent) => !options?.status || intent.status === options.status)
    .filter((intent) => !options?.type || intent.type === options.type)
    .filter((intent) => !wallet || intent.receiverWallet.toLowerCase() === wallet || intent.senderWallet?.toLowerCase() === wallet)
    .slice(0, options?.limit ?? MAX_PAYMENT_INTENTS);
}

export async function getPaymentIntent(id: string) {
  const items = await readRaw();
  return items.find((intent) => intent.id === id) ?? null;
}

export async function createPaymentIntent(input: PaymentIntentDraft): Promise<PaymentIntent> {
  const now = Date.now();
  const intent: PaymentIntent = normalizeIntent({
    ...input,
    id: input.id ?? makeId(input.type),
    amount: input.amount,
    tokenSymbol: input.tokenSymbol || 'USDC',
    chainId: input.chainId ?? Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? ARC_TESTNET_DEFAULTS.CHAIN_ID),
    status: input.status ?? 'draft',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  } as PaymentIntent);

  const current = await readRaw();
  await writeRaw([intent, ...current.filter((item) => item.id !== intent.id)]);
  return intent;
}

export async function updatePaymentIntent(id: string, patch: Partial<PaymentIntent>) {
  const current = await readRaw();
  const existing = current.find((intent) => intent.id === id);
  if (!existing) return null;

  const next = normalizeIntent({
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    paidAt: patch.status === 'confirmed' ? (patch.paidAt ?? Date.now()) : patch.paidAt ?? existing.paidAt,
  });

  await writeRaw([next, ...current.filter((item) => item.id !== id)]);
  return next;
}

export async function upsertPaymentIntent(input: PaymentIntentDraft) {
  if (input.id) {
    const current = await getPaymentIntent(input.id);
    if (current) return updatePaymentIntent(input.id, input as Partial<PaymentIntent>);
  }
  return createPaymentIntent(input);
}

export async function clearPaymentIntents() {
  await AsyncStorage.removeItem(STORAGE_KEYS.PAYMENT_INTENTS);
}


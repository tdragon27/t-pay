import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedTransaction } from '@/utils/storage';

export type PassportEventType =
  | 'qr_scan'
  | 'smart_qr_create'
  | 'invoice_scan'
  | 'payment_request_scan'
  | 'split_bill_scan'
  | 'market_scan'
  | 'market_create'
  | 'market_bet'
  | 'market_claim'
  | 'merchant_invoice_create'
  | 'merchant_invoice_paid'
  | 'fx_quote'
  | 'bridge_quote'
  | 'security_review';

export interface PassportEvent {
  id: string;
  type: PassportEventType;
  points: number;
  timestamp: number;
  label?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface PassportBadge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  icon: string;
}

export interface PassportSnapshot {
  points: number;
  level: string;
  progress: number;
  nextLevel: number;
  currentFloor: number;
  totalVolume: number;
  completedActions: number;
  streakDays: number;
  badges: PassportBadge[];
  events: PassportEvent[];
  hasSend: boolean;
  hasReceive: boolean;
  hasBridge: boolean;
  hasMarketAction: boolean;
  hasSmartQr: boolean;
}

const PASSPORT_EVENTS_PREFIX = 'tpay_passport_events_v1';


function keyFor(address: string) {
  return `${PASSPORT_EVENTS_PREFIX}_${address.toLowerCase()}`;
}

function randomId() {
  const suffix = Math.random().toString(16).slice(2, 10);
  return `evt_${Date.now()}_${suffix}`;
}

function parseAmount(value: string) {
  return Number(value.replace(/,/g, '')) || 0;
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function calculateStreak(timestamps: number[]) {
  const days = new Set(timestamps.map(dayKey));
  if (days.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function levelFromPoints(points: number) {
  if (points < 500) return { level: 'Starter', currentFloor: 0, nextLevel: 500 };
  if (points < 1500) return { level: 'Builder', currentFloor: 500, nextLevel: 1500 };
  if (points < 3000) return { level: 'Power User', currentFloor: 1500, nextLevel: 3000 };
  if (points < 5000) return { level: 'Arc Native', currentFloor: 3000, nextLevel: 5000 };
  return { level: 'T Pay Legend', currentFloor: 5000, nextLevel: 8000 };
}

export async function loadPassportEvents(address?: string | null): Promise<PassportEvent[]> {
  if (!address) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(address));
    if (!raw) return [];
    const events = JSON.parse(raw) as PassportEvent[];
    return Array.isArray(events) ? events.sort((a, b) => b.timestamp - a.timestamp) : [];
  } catch {
    return [];
  }
}

export async function recordPassportEvent(
  address: string | null | undefined,
  event: Omit<PassportEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
): Promise<PassportEvent | null> {
  if (!address) return null;
  const current = await loadPassportEvents(address);
  const nextEvent: PassportEvent = {
    id: event.id ?? randomId(),
    timestamp: event.timestamp ?? Date.now(),
    type: event.type,
    points: Math.max(0, Math.round(event.points)),
    label: event.label,
    metadata: event.metadata,
  };

  if (current.some((item) => item.id === nextEvent.id)) {
    return null;
  }

  const next = [nextEvent, ...current].slice(0, 120);
  await AsyncStorage.setItem(keyFor(address), JSON.stringify(next));
  return nextEvent;
}

export function buildPassportSnapshot(input: {
  address?: string | null;
  transactions: CachedTransaction[];
  usdcBalanceFormatted: string;
  events?: PassportEvent[];
}): PassportSnapshot {
  const completedTxs = input.transactions.filter((tx) => tx.status !== 'failed');
  const totalVolume = completedTxs.reduce((sum, tx) => sum + parseAmount(tx.value), 0);
  const usdcBalance = parseAmount(input.usdcBalanceFormatted);
  const hasSend = completedTxs.some((tx) => tx.type === 'send');
  const hasReceive = completedTxs.some((tx) => tx.type === 'receive');
  const hasBridge = completedTxs.some((tx) => tx.type === 'bridge');
  const events = input.events ?? [];
  const hasMarketAction = events.some((event) => event.type === 'market_bet' || event.type === 'market_create' || event.type === 'market_claim');
  const hasSmartQr = events.some((event) => event.type === 'invoice_scan' || event.type === 'payment_request_scan' || event.type === 'split_bill_scan' || event.type === 'market_scan' || event.type === 'smart_qr_create' || event.type === 'qr_scan');

  const transactionPoints = Math.min(totalVolume * 25, 2500) + completedTxs.length * 60;
  const milestonePoints =
    (input.address ? 100 : 0) +
    (usdcBalance > 0 ? 120 : 0) +
    (hasSend ? 150 : 0) +
    (hasReceive ? 100 : 0) +
    (hasBridge ? 180 : 0) +
    (hasMarketAction ? 220 : 0) +
    (hasSmartQr ? 160 : 0);
  const eventPoints = events.reduce((sum, event) => sum + event.points, 0);
  const points = Math.round(transactionPoints + milestonePoints + eventPoints);
  const levelInfo = levelFromPoints(points);
  const progress = Math.min(100, Math.round(((points - levelInfo.currentFloor) / (levelInfo.nextLevel - levelInfo.currentFloor)) * 100));
  const timestamps = [...completedTxs.map((tx) => tx.timestamp), ...events.map((event) => event.timestamp)];
  const streakDays = calculateStreak(timestamps);

  const badges: PassportBadge[] = [
    { id: 'wallet', label: 'Wallet Ready', description: 'Wallet is created or imported.', earned: Boolean(input.address), icon: 'wallet-outline' },
    { id: 'funded', label: 'Funded', description: 'Holds testnet USDC on Arc.', earned: usdcBalance > 0, icon: 'water-outline' },
    { id: 'payer', label: 'Payer', description: 'Sent at least one Arc payment.', earned: hasSend, icon: 'arrow-up-outline' },
    { id: 'receiver', label: 'Receiver', description: 'Received or claimed testnet USDC.', earned: hasReceive || usdcBalance > 0, icon: 'arrow-down-outline' },
    { id: 'smartqr', label: 'Smart QR', description: 'Scanned a T Pay QR action.', earned: hasSmartQr, icon: 'qr-code-outline' },
    { id: 'predictor', label: 'Picker', description: 'Joined or created a pick.', earned: hasMarketAction, icon: 'pulse-outline' },
    { id: 'bridge', label: 'Cross-chain', description: 'Used bridge flow at least once.', earned: hasBridge, icon: 'git-compare-outline' },
    { id: 'regular', label: 'Streak', description: 'Used T Pay today.', earned: streakDays >= 1, icon: 'flame-outline' },
  ];

  return {
    points,
    level: levelInfo.level,
    progress,
    nextLevel: levelInfo.nextLevel,
    currentFloor: levelInfo.currentFloor,
    totalVolume,
    completedActions: completedTxs.length + events.length,
    streakDays,
    badges,
    events,
    hasSend,
    hasReceive,
    hasBridge,
    hasMarketAction,
    hasSmartQr,
  };
}






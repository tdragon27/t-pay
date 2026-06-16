import type { UnifiedActivityItem } from '@/services/activityService';
import type { MerchantInvoice } from '@/services/merchantService';
import type { PendingTx } from '@/services/pendingTxService';
import { splitLifecycleStatus, splitProgress, type SplitBill } from '@/services/splitBillService';

export type ActivePaymentKind = 'split' | 'invoice' | 'pending_tx' | 'recent_receive';
export type ActivePaymentTone = 'info' | 'success' | 'warning' | 'danger' | 'muted';

export interface ActivePaymentItem {
  id: string;
  kind: ActivePaymentKind;
  title: string;
  amount: string;
  detail: string;
  status: string;
  tone: ActivePaymentTone;
  progressPercent?: number;
  ctaLabel: string;
  route?: string;
  txHash?: string;
  accent: string;
  icon: 'people-outline' | 'receipt-outline' | 'time-outline' | 'arrow-down-circle-outline';
  timestamp: number;
}

interface BuildActivePaymentInput {
  address?: string | null;
  splits?: SplitBill[];
  invoices?: MerchantInvoice[];
  pendingTxs?: PendingTx[];
  activityItems?: UnifiedActivityItem[];
  limit?: number;
}

function numeric(value?: string | number | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: string | number) {
  return numeric(value).toFixed(2);
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function belongsToAddress(split: SplitBill, address?: string | null) {
  if (!address) return true;
  return (
    sameAddress(split.receiverWallet, address) ||
    sameAddress(split.creatorAddress, address) ||
    split.participants.some((participant) => sameAddress(participant.address, address) || sameAddress(participant.payerWallet, address))
  );
}

function isRecent(timestamp: number, windowMs = 2 * 60 * 60 * 1000) {
  const normalized = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return Date.now() - normalized <= windowMs;
}

function expiresText(expiresAt?: number) {
  if (!expiresAt) return 'No expiry set';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `Expires in ${hours}h`;
  return `Expires in ${Math.ceil(hours / 24)}d`;
}

function dedupeActive(items: ActivePaymentItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.txHash ? `tx:${item.txHash.toLowerCase()}` : item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildActivePaymentItems({
  address,
  splits = [],
  invoices = [],
  pendingTxs = [],
  activityItems = [],
  limit = 4,
}: BuildActivePaymentInput): ActivePaymentItem[] {
  const splitItems: ActivePaymentItem[] = splits
    .filter((split) => belongsToAddress(split, address))
    .map((split) => ({ split, lifecycle: splitLifecycleStatus(split), progress: splitProgress(split) }))
    .filter(({ lifecycle }) => lifecycle === 'open' || lifecycle === 'partial')
    .map(({ split, lifecycle, progress }) => ({
      id: `split:${split.id}`,
      kind: 'split' as const,
      title: split.note || 'Split Bill',
      amount: `${formatAmount(progress.receivedUsdc)} / ${formatAmount(progress.totalUsdc)} USDC collected`,
      detail: `${progress.paid} of ${progress.total} participants paid`,
      status: lifecycle === 'partial' ? 'Partial' : 'Open',
      tone: lifecycle === 'partial' ? 'info' as const : 'warning' as const,
      progressPercent: progress.percent,
      ctaLabel: 'View Split',
      route: `/split/${split.id}`,
      accent: '#8B79FF',
      icon: 'people-outline' as const,
      timestamp: split.updatedAt ?? split.createdAt,
    }));

  const invoiceItems: ActivePaymentItem[] = invoices
    .filter((invoice) => invoice.status === 'open')
    .filter((invoice) => !address || sameAddress(invoice.merchantAddress, address))
    .map((invoice) => ({
      id: `invoice:${invoice.id}`,
      kind: 'invoice' as const,
      title: invoice.label || 'Merchant Invoice',
      amount: `${formatAmount(invoice.amount)} ${invoice.tokenSymbol ?? 'USDC'} unpaid`,
      detail: expiresText(invoice.expiresAt),
      status: 'Unpaid',
      tone: 'warning' as const,
      ctaLabel: 'View Invoice',
      route: `/invoice/${invoice.id}`,
      accent: '#00E88F',
      icon: 'receipt-outline' as const,
      timestamp: invoice.updatedAt ?? invoice.createdAt,
    }));

  const pendingItems: ActivePaymentItem[] = pendingTxs.map((tx) => {
    const token = typeof tx.metadata?.token === 'string' ? tx.metadata.token : 'USDC';
    const amount = typeof tx.metadata?.amount === 'string' || typeof tx.metadata?.amount === 'number'
      ? `${formatAmount(tx.metadata.amount)} ${token}`
      : 'Arc transaction';
    return {
      id: `pending:${tx.txHash.toLowerCase()}`,
      kind: 'pending_tx' as const,
      title: tx.type === 'send' ? 'Pending Payment' : tx.type === 'invoice' ? 'Pending Invoice' : 'Pending Transaction',
      amount: tx.type === 'send' ? `Sending ${amount}` : amount,
      detail: 'Confirming on Arc Testnet',
      status: 'Pending',
      tone: 'warning' as const,
      ctaLabel: 'View Transaction',
      txHash: tx.txHash,
      accent: '#FFB547',
      icon: 'time-outline' as const,
      timestamp: tx.createdAt,
    };
  });

  const recentReceive = activityItems.find((item) => (
    item.direction === 'incoming' &&
    item.status === 'confirmed' &&
    item.amount &&
    isRecent(item.timestamp) &&
    ['receive', 'split', 'merchant'].includes(item.sourceFeature)
  ));

  const receiveItems: ActivePaymentItem[] = recentReceive ? [{
    id: `recent:${recentReceive.txHash?.toLowerCase() ?? recentReceive.id}`,
    kind: 'recent_receive',
    title: 'Recent Receive',
    amount: `+${formatAmount(recentReceive.amount ?? 0)} ${recentReceive.token ?? 'USDC'}`,
    detail: recentReceive.sourceFeature === 'split' ? 'From split payment' : recentReceive.sourceFeature === 'merchant' ? 'From merchant invoice' : 'Payment received',
    status: 'Received',
    tone: 'success',
    ctaLabel: 'View Activity',
    route: '/history',
    txHash: recentReceive.txHash,
    accent: '#00E88F',
    icon: 'arrow-down-circle-outline',
    timestamp: recentReceive.timestamp,
  }] : [];

  return dedupeActive([...pendingItems, ...splitItems, ...invoiceItems, ...receiveItems])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function latestActivityPreview(items: UnifiedActivityItem[], limit = 1) {
  return items
    .filter((item) => item.status !== 'cancelled')
    .slice(0, limit);
}

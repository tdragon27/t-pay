import type { MerchantInvoice } from '@/services/merchantService';
import { formatCurrency } from '@/utils/format';

export interface MerchantDailyVolume {
  date: string;
  paidVolumeUsd: number;
  invoiceCount: number;
}

export interface MerchantTokenVolume {
  token: string;
  amount: number;
  usdValue: number;
}

export interface MerchantAnalytics {
  totalInvoices: number;
  openInvoices: number;
  paidInvoices: number;
  expiredInvoices: number;
  cancelledInvoices: number;
  paidVolumeUsd: number;
  openVolumeUsd: number;
  paidDisplayVnd: number;
  successRate: number;
  averageSettlementMs: number | null;
  medianSettlementMs: number | null;
  fastestSettlementMs: number | null;
  volumeByToken: Record<string, number>;
  tokenVolumes: MerchantTokenVolume[];
  dailyVolumes: MerchantDailyVolume[];
  latestPaidAt?: number;
}

function tokenUsdValue(invoice: MerchantInvoice) {
  const amount = Number(invoice.amount || 0);
  if (invoice.tokenSymbol === 'EURC') return amount * 1.08;
  return amount;
}

function displayVndValue(invoice: MerchantInvoice) {
  const display = Number(invoice.displayAmount || 0);
  if (!Number.isFinite(display)) return 0;
  if (invoice.displayCurrency === 'VND') return display;
  return display * 25_500;
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildMerchantAnalytics(invoices: MerchantInvoice[]): MerchantAnalytics {
  const paid = invoices.filter((invoice) => invoice.status === 'paid');
  const open = invoices.filter((invoice) => invoice.status === 'open');
  const expired = invoices.filter((invoice) => invoice.status === 'expired');
  const cancelled = invoices.filter((invoice) => invoice.status === 'cancelled');
  const completed = paid.length + expired.length + cancelled.length;
  const settlementTimes = paid
    .map((invoice) => (invoice.paidAt && invoice.createdAt ? invoice.paidAt - invoice.createdAt : null))
    .filter((value): value is number => typeof value === 'number' && value >= 0);

  const volumeByToken = paid.reduce<Record<string, number>>((acc, invoice) => {
    acc[invoice.tokenSymbol] = (acc[invoice.tokenSymbol] ?? 0) + Number(invoice.amount || 0);
    return acc;
  }, {});

  const tokenVolumes = Object.entries(volumeByToken)
    .map(([token, amount]) => ({ token, amount, usdValue: token === 'EURC' ? amount * 1.08 : amount }))
    .sort((left, right) => right.usdValue - left.usdValue);

  const dailyMap = paid.reduce<Record<string, MerchantDailyVolume>>((acc, invoice) => {
    const key = dayKey(invoice.paidAt ?? invoice.updatedAt ?? invoice.createdAt);
    const row = acc[key] ?? { date: key, paidVolumeUsd: 0, invoiceCount: 0 };
    row.paidVolumeUsd += tokenUsdValue(invoice);
    row.invoiceCount += 1;
    acc[key] = row;
    return acc;
  }, {});

  return {
    totalInvoices: invoices.length,
    openInvoices: open.length,
    paidInvoices: paid.length,
    expiredInvoices: expired.length,
    cancelledInvoices: cancelled.length,
    paidVolumeUsd: paid.reduce((sum, invoice) => sum + tokenUsdValue(invoice), 0),
    openVolumeUsd: open.reduce((sum, invoice) => sum + tokenUsdValue(invoice), 0),
    paidDisplayVnd: paid.reduce((sum, invoice) => sum + displayVndValue(invoice), 0),
    successRate: completed === 0 ? 0 : (paid.length / completed) * 100,
    averageSettlementMs: settlementTimes.length === 0
      ? null
      : settlementTimes.reduce((sum, value) => sum + value, 0) / settlementTimes.length,
    medianSettlementMs: median(settlementTimes),
    fastestSettlementMs: settlementTimes.length === 0 ? null : Math.min(...settlementTimes),
    volumeByToken,
    tokenVolumes,
    dailyVolumes: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    latestPaidAt: paid.reduce<number | undefined>((latest, invoice) => {
      if (!invoice.paidAt) return latest;
      return latest === undefined || invoice.paidAt > latest ? invoice.paidAt : latest;
    }, undefined),
  };
}

export function formatSettlementDuration(ms: number | null) {
  if (ms === null) return 'No paid invoices yet';
  if (ms < 1_000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function formatMerchantVolume(analytics: MerchantAnalytics) {
  return `${formatCurrency(analytics.paidVolumeUsd, 'USD')} / ${formatCurrency(analytics.paidDisplayVnd, 'VND')}`;
}

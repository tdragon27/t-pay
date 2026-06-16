import type { IndexedInvoice } from './merchantIndexer';

export interface MerchantAnalyticsSummary {
  totalInvoices: number;
  openInvoices: number;
  paidInvoices: number;
  expiredInvoices: number;
  cancelledInvoices: number;
  paidVolumeUsd: number;
  openVolumeUsd: number;
  successRate: number;
  averageSettlementMs: number | null;
  volumeByToken: Record<string, number>;
  latestPaidAt?: number;
}

function tokenUsdValue(invoice: IndexedInvoice) {
  const amount = Number(invoice.amount || 0);
  if (invoice.tokenSymbol === 'EURC') return amount * 1.08;
  return amount;
}

export function buildMerchantAnalyticsSummary(invoices: IndexedInvoice[]): MerchantAnalyticsSummary {
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

  return {
    totalInvoices: invoices.length,
    openInvoices: open.length,
    paidInvoices: paid.length,
    expiredInvoices: expired.length,
    cancelledInvoices: cancelled.length,
    paidVolumeUsd: paid.reduce((sum, invoice) => sum + tokenUsdValue(invoice), 0),
    openVolumeUsd: open.reduce((sum, invoice) => sum + tokenUsdValue(invoice), 0),
    successRate: completed === 0 ? 0 : (paid.length / completed) * 100,
    averageSettlementMs: settlementTimes.length === 0
      ? null
      : settlementTimes.reduce((sum, value) => sum + value, 0) / settlementTimes.length,
    volumeByToken,
    latestPaidAt: paid.reduce<number | undefined>((latest, invoice) => {
      if (!invoice.paidAt) return latest;
      return latest === undefined || invoice.paidAt > latest ? invoice.paidAt : latest;
    }, undefined),
  };
}

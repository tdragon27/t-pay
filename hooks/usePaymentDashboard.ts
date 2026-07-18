import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { loadMerchantInvoices, type MerchantInvoice } from '@/services/merchantService';
import { loadPendingTxs, type PendingTx } from '@/services/pendingTxService';
import { loadSplitBills, type SplitBill } from '@/services/splitBillService';
import type { UnifiedActivityItem } from '@/services/activityService';
import type { CachedTransaction } from '@/utils/storage';
import { buildActivePaymentItems, latestActivityPreview } from '@/utils/paymentDashboard';

interface UsePaymentDashboardOptions {
  address?: string | null;
  transactions?: CachedTransaction[];
  activeLimit?: number;
  activityLimit?: number;
}

export function usePaymentDashboard({
  address,
  transactions = [],
  activeLimit = 4,
  activityLimit = 2,
}: UsePaymentDashboardOptions) {
  const [splits, setSplits] = useState<SplitBill[]>([]);
  const [invoices, setInvoices] = useState<MerchantInvoice[]>([]);
  const [pendingTxs, setPendingTxs] = useState<PendingTx[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activity = useActivityFeed({ address, transactions, limit: 20 });

  const refreshDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSplits, nextInvoices, nextPending] = await Promise.all([
        loadSplitBills().catch(() => [] as SplitBill[]),
        address ? loadMerchantInvoices({ merchantAddress: address, preferBackend: true }).catch(() => [] as MerchantInvoice[]) : Promise.resolve([] as MerchantInvoice[]),
        loadPendingTxs().catch(() => [] as PendingTx[]),
      ]);

      setSplits(nextSplits);
      setInvoices(nextInvoices);
      setPendingTxs(nextPending);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load active payments.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshDashboardData(), activity.refresh()]);
  }, [activity.refresh, refreshDashboardData]);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  const activePayments = useMemo(
    () => buildActivePaymentItems({ address, splits, invoices, pendingTxs, activityItems: activity.items, limit: activeLimit }),
    [address, splits, invoices, pendingTxs, activity.items, activeLimit],
  );

  const latestActivity = useMemo<UnifiedActivityItem[]>(
    () => latestActivityPreview(activity.items, activityLimit),
    [activity.items, activityLimit],
  );

  return {
    activePayments,
    latestActivity,
    activityItems: activity.items,
    splits,
    invoices,
    pendingTxs,
    isLoading: isLoading || activity.isLoading,
    error: error ?? activity.error,
    refresh,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { isMerchantBackendSyncEnabled } from '@/services/merchantService';
import { loadPendingTxs } from '@/services/pendingTxService';

export type SmartAlertSeverity = 'info' | 'warning' | 'error' | 'success';

export interface SmartAlert {
  id: string;
  severity: SmartAlertSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  route?: string;
}

export function useSmartAlerts(input: {
  address?: string | null;
  isOffline?: boolean;
  balanceSource?: string;
  balanceErrorCount?: number;
  usingCachedBalance?: boolean;
  openSplitCount?: number;
  openInvoiceCount?: number;
  backupVerified?: boolean;
}) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const pending = await loadPendingTxs();
      if (active) setPendingCount(pending.length);
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return useMemo(() => {
    const alerts: SmartAlert[] = [];

    alerts.push({
      id: 'testnet-only',
      severity: 'info',
      title: 'Arc Testnet',
      message: 'T Pay uses Arc Testnet assets only. Do not send mainnet assets here.',
    });

    if (!input.address) {
      alerts.push({ id: 'no-wallet', severity: 'warning', title: 'Wallet not ready', message: 'Create or import a wallet before testing payments.', actionLabel: 'Open wallet', route: '/onboarding' });
    }

    if (input.isOffline) {
      alerts.push({ id: 'offline', severity: 'warning', title: 'Read-only mode', message: 'No internet connection. Balances and payments may show cached data.' });
    }

    if (input.usingCachedBalance || input.balanceSource === 'UNAVAILABLE') {
      alerts.push({ id: 'cached-balance', severity: 'warning', title: 'Using cached balance', message: 'Arc RPC/App Kit is unavailable, so the last known balance is displayed.' });
    }

    if ((input.balanceErrorCount ?? 0) > 0) {
      alerts.push({ id: 'balance-errors', severity: 'warning', title: 'Some balance routes failed', message: `${input.balanceErrorCount} balance source(s) returned an error. Core Arc payments can still work.` });
    }

    if (pendingCount > 0) {
      alerts.push({ id: 'pending-tx', severity: 'info', title: 'Pending transaction', message: `${pendingCount} transaction(s) are waiting for confirmation.`, actionLabel: 'View activity', route: '/history' });
    }

    if ((input.openSplitCount ?? 0) > 0) {
      alerts.push({ id: 'open-splits', severity: 'info', title: 'Split bills waiting', message: `${input.openSplitCount} open split bill(s) still need payment.`, actionLabel: 'Open Split', route: '/split-bill' });
    }

    if ((input.openInvoiceCount ?? 0) > 0) {
      alerts.push({ id: 'open-invoices', severity: 'info', title: 'Merchant invoices open', message: `${input.openInvoiceCount} invoice(s) are still unpaid.`, actionLabel: 'Merchant', route: '/merchant' });
    }

    if (!isSupabaseConfigured()) {
      alerts.push({ id: 'supabase-missing', severity: 'warning', title: 'Split sync not configured', message: 'Supabase keys are missing. Split bills will not sync across devices.' });
    }

    if (!process.env.EXPO_PUBLIC_CIRCLE_APP_KIT_KEY) {
      alerts.push({ id: 'appkit-missing', severity: 'warning', title: 'App Kit key missing', message: 'Circle App Kit routes may fall back or be unavailable until the key is configured.' });
    }

    if (!isMerchantBackendSyncEnabled()) {
      alerts.push({ id: 'backend-missing', severity: 'info', title: 'Local merchant mode', message: 'Merchant invoices are stored locally unless backend sync is configured.' });
    }

    return alerts.slice(0, 5);
  }, [input.address, input.isOffline, input.balanceSource, input.balanceErrorCount, input.usingCachedBalance, input.openSplitCount, input.openInvoiceCount, pendingCount]);
}



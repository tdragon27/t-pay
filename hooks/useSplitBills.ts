import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, getSupabaseStatus, isSupabaseConfigured } from '@/services/supabaseClient';
import { expireOpenSplitBills, loadSplitBills, splitLifecycleStatus, type SplitBill } from '@/services/splitBillService';

export type SplitFilter = 'all' | 'open' | 'partial' | 'complete' | 'expired';

function makeRealtimeTopic() {
  return 'tpay-split-bills-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export function formatSplitSyncError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  const lower = message.toLowerCase();

  if (!isSupabaseConfigured()) return 'Split sync is not configured yet.';
  if (lower.includes('network request failed') || lower.includes('failed to fetch') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Split sync is temporarily unavailable. Check your internet connection or Supabase project status.';
  }
  if (lower.includes('does not exist') || lower.includes('relation') || lower.includes('schema cache') || lower.includes('function')) {
    return 'Split sync tables are not ready. Run the Supabase split bill migration, then try again.';
  }
  if (lower.includes('permission denied') || lower.includes('row-level security') || lower.includes('rls')) {
    return 'Split sync permissions are not ready. Check Supabase RLS policies for split_bills and participants.';
  }
  return 'Unable to load split bills. Please try again.';
}

export function useSplitBills(options?: { filter?: SplitFilter; search?: string }) {
  const configured = isSupabaseConfigured();
  const [splits, setSplits] = useState<SplitBill[]>([]);
  const [loading, setLoading] = useState(() => configured);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const status = getSupabaseStatus();
    setRefreshing(true);

    if (!status.configured) {
      setSplits([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      await expireOpenSplitBills();
      const next = await loadSplitBills();
      setSplits(next);
      setError(null);
    } catch (err) {
      setError(formatSplitSyncError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let mounted = true;
    const channel = supabase.channel(makeRealtimeTopic());

    // Register callbacks before subscribe. Supabase Realtime throws if a callback
    // is added after subscribe(), especially during Expo fast refresh.
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'split_bills' }, () => {
      if (mounted) void refresh();
    });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
      if (mounted) void refresh();
    });

    channel.subscribe((status) => {
      if (!mounted) return;
      if (status === 'CHANNEL_ERROR') setError(null);
    });

    const expiryTimer = setInterval(() => { if (mounted) void refresh(); }, 60_000);

    return () => {
      mounted = false;
      clearInterval(expiryTimer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const filteredSplits = useMemo(() => {
    const filter = options?.filter || 'all';
    const search = (options?.search || '').trim().toLowerCase();

    return splits.filter((split) => {
      const status = splitLifecycleStatus(split);
      const filterOk = filter === 'all' || status === filter;
      const searchOk = !search || (split.note || '').toLowerCase().includes(search);
      return filterOk && searchOk;
    });
  }, [splits, options?.filter, options?.search]);

  return {
    splits: filteredSplits,
    allSplits: splits,
    loading,
    refreshing,
    error,
    configured,
    refresh,
  };
}




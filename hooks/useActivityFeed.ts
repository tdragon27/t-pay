import { useCallback, useEffect, useState } from 'react';
import { loadPendingTxs } from '@/services/pendingTxService';
import { loadActivityItems, mergeActivityItems, arcExplorerTxUrl, type UnifiedActivityItem } from '@/services/activityService';
import type { CachedTransaction } from '@/utils/storage';

function normalizeTimestamp(timestamp: number) {
  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function cachedTxToActivity(tx: CachedTransaction): UnifiedActivityItem {
  return {
    id: `cache_${tx.hash}`,
    type: tx.type === 'bridge' ? 'bridge' : tx.type,
    amount: tx.value,
    token: 'USDC',
    direction: tx.type === 'send' ? 'outgoing' : 'incoming',
    status: tx.status === 'success' ? 'confirmed' : tx.status,
    timestamp: normalizeTimestamp(tx.timestamp),
    txHash: tx.hash,
    explorerUrl: arcExplorerTxUrl(tx.hash),
    sourceFeature: tx.type === 'bridge' ? 'bridge' : tx.type,
    counterparty: tx.type === 'send' ? tx.to : tx.from,
    label: tx.type === 'send' ? 'USDC sent' : tx.type === 'receive' ? 'USDC received' : 'Bridge transfer',
  };
}

export function useActivityFeed(options?: { address?: string | null; transactions?: CachedTransaction[]; limit?: number }) {
  const [items, setItems] = useState<UnifiedActivityItem[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stored, pending] = await Promise.all([loadActivityItems(), loadPendingTxs()]);
      const cached = (options?.transactions ?? []).map(cachedTxToActivity);
      const pendingItems: UnifiedActivityItem[] = pending.map((tx) => {
        const activityType: UnifiedActivityItem['type'] =
          tx.type === 'invoice' ? 'merchant_invoice' :
          tx.type === 'swap' ? 'fx_swap' :
          tx.type === 'market' ? 'passport' :
          tx.type === 'recurring' ? 'request' :
          tx.type;
        const sourceFeature: UnifiedActivityItem['sourceFeature'] =
          tx.type === 'swap' ? 'fx' :
          tx.type === 'invoice' ? 'merchant' :
          tx.type === 'market' ? 'passport' :
          tx.type === 'recurring' ? 'request' :
          tx.type;

        return {
          id: `pending_${tx.txHash}`,
          type: activityType,
          amount: typeof tx.metadata?.amount === 'string' ? tx.metadata.amount : undefined,
          token: typeof tx.metadata?.token === 'string' ? tx.metadata.token : 'USDC',
          direction: tx.type === 'send' || tx.type === 'swap' || tx.type === 'invoice' ? 'outgoing' : 'neutral',
          status: 'pending',
          timestamp: tx.createdAt,
          txHash: tx.txHash,
          explorerUrl: tx.explorerUrl ?? arcExplorerTxUrl(tx.txHash),
          sourceFeature,
          counterparty: typeof tx.metadata?.to === 'string' ? tx.metadata.to : undefined,
          label: tx.label,
        };
      });
      setItems(mergeActivityItems(stored, pendingItems, cached).slice(0, options?.limit ?? 80));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load activity.');
    } finally {
      setLoading(false);
    }
  }, [options?.transactions, options?.limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, isLoading, error, refresh };
}


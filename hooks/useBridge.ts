// hooks/useBridge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain USDC bridge hook using Circle CCTP (via Arc App Kit).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { parseUnits } from 'viem';
import {
  getBridgeQuote,
  initiateBridge,
  getBridgeStatus,
  type BridgeQuote,
} from '@/lib/arcAppKit';
import { loadPrivateKey } from '@/lib/wallet';
import { useWalletStore } from '@/store/walletStore';

export type BridgeStatus =
  | 'idle'
  | 'quoting'
  | 'signing'
  | 'bridging'
  | 'attesting'
  | 'minting'
  | 'success'
  | 'error';

export function useBridge() {
  const { address } = useWalletStore();
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = useCallback(
    async (destinationChainId: number, amountStr: string) => {
      setStatus('quoting');
      setError(null);
      try {
        const amount = parseUnits(amountStr, 6);
        const pk = await loadPrivateKey();
        const q = await getBridgeQuote(destinationChainId, amount, pk ?? undefined, address ?? undefined);
        setQuote(q);
        setStatus('idle');
        return q;
      } catch (err: any) {
        setError(err?.message ?? 'Failed to fetch quote');
        setStatus('error');
        return null;
      }
    },
    [address]
  );

  const executeBridge = useCallback(
    async (
      destinationChainId: number,
      destinationAddress: string,
      amountStr: string
    ) => {
      setError(null);
      setTxHash(null);

      const pk = await loadPrivateKey();
      if (!pk) {
        setError('Wallet not loaded');
        setStatus('error');
        return null;
      }

      try {
        setStatus('signing');
        const amount = parseUnits(amountStr, 6);

        setStatus('bridging');
        const hash = await initiateBridge(pk, destinationChainId, destinationAddress, amount);
        setTxHash(hash);
        const bridgeStatus = await getBridgeStatus(hash);
        if (bridgeStatus.status === 'failed') {
          throw new Error(bridgeStatus.message ?? 'Bridge failed');
        }

        setStatus(bridgeStatus.status === 'complete' ? 'success' : 'attesting');
        return { txHash: hash };
      } catch (err: any) {
        setError(err?.message ?? 'Bridge failed');
        setStatus('error');
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setQuote(null);
    setTxHash(null);
    setError(null);
  }, []);

  return { fetchQuote, executeBridge, status, quote, txHash, error, reset };
}

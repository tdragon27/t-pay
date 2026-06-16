import { useEffect, useCallback, useRef, useState } from 'react';
import { getPublicClient, resetPublicClient, ERC20_ABI } from '@/lib/viemClient';
import { SUPPORTED_ARC_TESTNET_TOKENS, type SupportedArcTokenSymbol } from '@/constants/tokens';
import { formatTokenAmount } from '@/utils/format';
import { useWalletStore, type TokenBalanceMap } from '@/store/walletStore';

const POLL_INTERVAL_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_500;
const FETCH_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function compactErrorMessage(error: unknown): string {
  const raw = (error as any)?.shortMessage || (error as any)?.message || String(error || 'Unknown error');
  const firstLine = raw.split('\n')[0]?.trim() || 'Unknown error';

  if (firstLine.includes('404')) return 'RPC endpoint returned 404';
  if (firstLine.toLowerCase().includes('timed out')) return 'RPC request timed out';
  if (firstLine.toLowerCase().includes('fetch failed')) return 'RPC request failed';

  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
}

function createLoadingSnapshot(previous: TokenBalanceMap): TokenBalanceMap {
  return SUPPORTED_ARC_TESTNET_TOKENS.reduce((acc, token) => {
    acc[token.symbol] = {
      ...previous[token.symbol],
      symbol: token.symbol,
      isLoading: true,
      error: null,
    };
    return acc;
  }, {} as TokenBalanceMap);
}

export function useBalance() {
  const { address, tokenBalances, setBalance, setBalanceLoading, setAllTokenBalances } = useWalletStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) return;

    setBalanceLoading(true);
    setAllTokenBalances(createLoadingSnapshot(useWalletStore.getState().tokenBalances));
    setFetchError(null);

    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = getPublicClient();
        const rows = await withTimeout(
          Promise.all(
            SUPPORTED_ARC_TESTNET_TOKENS.map(async (token) => {
              try {
                const raw = await client.readContract({
                  address: token.contractAddress,
                  abi: ERC20_ABI,
                  functionName: 'balanceOf',
                  args: [address],
                });

                return {
                  symbol: token.symbol,
                  raw: raw as bigint,
                  formatted: formatTokenAmount(raw as bigint, token.decimals, token.displayDecimals),
                  isLoading: false,
                  error: null,
                  updatedAt: Date.now(),
                };
              } catch (err) {
                return {
                  symbol: token.symbol,
                  raw: null,
                  formatted: '—',
                  isLoading: false,
                  error: compactErrorMessage(err),
                  updatedAt: Date.now(),
                };
              }
            }),
          ),
          FETCH_TIMEOUT_MS,
        );

        const next = rows.reduce((acc, row) => {
          acc[row.symbol as SupportedArcTokenSymbol] = row;
          return acc;
        }, {} as TokenBalanceMap);

        setAllTokenBalances(next);

        const usdc = next.USDC;
        if (usdc?.raw !== null && !usdc.error) {
          setBalance(usdc.raw, usdc.formatted);
        }

        const failed = rows.filter((row) => row.error);
        setFetchError(failed.length ? `Unable to load ${failed.map((row) => row.symbol).join(', ')} balance.` : null);
        setBalanceLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        console.warn(`[useBalance] attempt ${attempt}/${MAX_RETRIES} failed:`, compactErrorMessage(err));

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    resetPublicClient();
    const errMsg = compactErrorMessage(lastErr);
    console.error('[useBalance] all retries failed:', errMsg);
    setFetchError(errMsg);
    setAllTokenBalances(
      SUPPORTED_ARC_TESTNET_TOKENS.reduce((acc, token) => {
        acc[token.symbol] = {
          ...useWalletStore.getState().tokenBalances[token.symbol],
          symbol: token.symbol,
          formatted: '—',
          isLoading: false,
          error: errMsg,
          updatedAt: Date.now(),
        };
        return acc;
      }, {} as TokenBalanceMap),
    );
    setBalanceLoading(false);
  }, [address, setAllTokenBalances, setBalance, setBalanceLoading]);

  useEffect(() => {
    void fetchBalance();
    timerRef.current = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchBalance]);

  return { refetch: fetchBalance, fetchError, tokenBalances };
}


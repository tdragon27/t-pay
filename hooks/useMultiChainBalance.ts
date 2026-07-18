import { useState, useEffect, useCallback, useMemo } from 'react';
import { defineChain, parseUnits } from 'viem';
import { createPublicClientForChain, ERC20_ABI } from '@/lib/viemClient';
import { chainIdForAppKitChainName, fetchUnifiedUsdcBalances, isArcAppKitConfigured } from '@/lib/arcAppKit';
import { BRIDGE_CHAINS, type BridgeChain } from '@/constants/chains';
import { formatUsdc } from '@/utils/format';

// Arc docs used: https://docs.arc.io/app-kit
// Prefer App Kit unified balance first, then fall back to direct testnet RPC reads.
export type BalanceSource = 'APP_KIT_UNIFIED_BALANCE' | 'RPC_FALLBACK' | 'UNAVAILABLE';

const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  80002: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
};

const CHAIN_RPCS: Record<number, string[]> = {
  84532: ['https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org'],
  11155111: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://eth-sepolia.public.blastapi.io'],
  421614: ['https://arbitrum-sepolia-rpc.publicnode.com', 'https://sepolia-rollup.arbitrum.io/rpc'],
  80002: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://rpc-amoy.polygon.technology'],
};

const CHAIN_DEFS: Record<number, ReturnType<typeof defineChain>> = {
  84532: defineChain({
    id: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [CHAIN_RPCS[84532][0]] } },
    testnet: true,
  }),
  11155111: defineChain({
    id: 11155111,
    name: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [CHAIN_RPCS[11155111][0]] } },
    testnet: true,
  }),
  421614: defineChain({
    id: 421614,
    name: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [CHAIN_RPCS[421614][0]] } },
    testnet: true,
  }),
  80002: defineChain({
    id: 80002,
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: { default: { http: [CHAIN_RPCS[80002][0]] } },
    testnet: true,
  }),
};

export interface ChainBalance {
  chainId: number;
  chainName: string;
  logo: string;
  balance: string;
  rawBalance: bigint;
  isLoading: boolean;
  error: boolean;
  errorMsg?: string;
  source: BalanceSource;
  updatedAt?: number;
}

const CHAIN_TIMEOUT_MS = 10_000;

function createEmptyBalance(chain: BridgeChain, source: BalanceSource = 'UNAVAILABLE'): ChainBalance {
  return {
    chainId: chain.id,
    chainName: chain.name,
    logo: chain.logo,
    balance: '0.00',
    rawBalance: 0n,
    isLoading: false,
    error: false,
    source,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Chain RPC timed out after ${ms}ms`)), ms)),
  ]);
}

function compactErrorMessage(error: unknown): string {
  const raw = (error as any)?.shortMessage || (error as any)?.message || String(error || 'Unknown error');
  const firstLine = raw.split('\n')[0]?.trim() || 'Unknown error';

  if (firstLine.includes('404') || firstLine.includes('requested URL was not found')) {
    return 'RPC endpoint returned 404';
  }
  if (firstLine.toLowerCase().includes('timed out')) {
    return 'RPC request timed out';
  }
  if (firstLine.toLowerCase().includes('fetch failed')) {
    return 'RPC request failed';
  }

  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function formattedUsdcToNumber(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

async function fetchChainBalance(chain: BridgeChain, address: string): Promise<bigint> {
  const usdcAddress = USDC_ADDRESSES[chain.id];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for chain ${chain.id}`);
  }

  const rpcCandidates = CHAIN_RPCS[chain.id] ?? [];

  for (const rpc of rpcCandidates) {
    try {
      const client = createPublicClientForChain(rpc, CHAIN_DEFS[chain.id]);
      const raw = (await withTimeout(
        client.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }),
        CHAIN_TIMEOUT_MS,
      )) as bigint;

      return raw;
    } catch (error) {
      console.warn(`[useMultiChainBalance] chain ${chain.id} RPC ${rpc} failed: ${compactErrorMessage(error)}`);
    }
  }

  throw new Error(`All RPCs failed for chain ${chain.id}`);
}

async function fetchUnifiedBalanceMap(address: string): Promise<Map<number, bigint> | null> {
  if (!isArcAppKitConfigured()) return null;
  try {
    const unified = await fetchUnifiedUsdcBalances({
      address,
      chains: ['Base_Sepolia', 'Ethereum_Sepolia', 'Arbitrum_Sepolia', 'Polygon_Amoy_Testnet'],
    });
    const map = new Map<number, bigint>();

    for (const row of unified.chains) {
      const chainId = chainIdForAppKitChainName(row.chain);
      if (!chainId) continue;
      map.set(chainId, parseUnits(row.confirmedBalance || '0', 6));
    }

    return map;
  } catch (error) {
    console.warn(`[useMultiChainBalance] App Kit unified balance unavailable: ${compactErrorMessage(error)}`);
    return null;
  }
}

export function useMultiChainBalance(address: string | null) {
  const [balances, setBalances] = useState<ChainBalance[]>(() => BRIDGE_CHAINS.map((chain) => createEmptyBalance(chain)));
  const [totalUSD, setTotalUSD] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [source, setSource] = useState<BalanceSource>('UNAVAILABLE');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const fetchAll = useCallback(
    async (manual = false) => {
      if (!address) {
        setBalances(BRIDGE_CHAINS.map((chain) => createEmptyBalance(chain)));
        setTotalUSD(0);
        setSource('UNAVAILABLE');
        setLastUpdatedAt(null);
        return;
      }
      if (manual) setIsRefreshing(true);

      setBalances((current) => current.map((item) => ({ ...item, isLoading: true, error: false, errorMsg: undefined })));

      try {
        const unifiedMap = await fetchUnifiedBalanceMap(address);
        const now = Date.now();

        if (unifiedMap) {
          let total = 0;
          const updated = BRIDGE_CHAINS.map((chain) => {
            const raw = unifiedMap.get(chain.id) ?? 0n;
            const formatted = formatUsdc(raw);
            total += formattedUsdcToNumber(formatted);

            return {
              ...createEmptyBalance(chain, 'APP_KIT_UNIFIED_BALANCE'),
              balance: formatted,
              rawBalance: raw,
              updatedAt: now,
            } satisfies ChainBalance;
          });

          setBalances(updated);
          setTotalUSD(total);
          setSource('APP_KIT_UNIFIED_BALANCE');
          setLastUpdatedAt(now);
          return;
        }

        const results = await Promise.allSettled(BRIDGE_CHAINS.map((chain) => fetchChainBalance(chain, address)));

        let total = 0;
        const updated = BRIDGE_CHAINS.map((chain, index) => {
          const result = results[index];

          if (result.status === 'fulfilled') {
            const raw = result.value;
            const formatted = formatUsdc(raw);
            total += formattedUsdcToNumber(formatted);

            return {
              ...createEmptyBalance(chain, 'RPC_FALLBACK'),
              balance: formatted,
              rawBalance: raw,
              updatedAt: now,
            } satisfies ChainBalance;
          }

          return {
            ...createEmptyBalance(chain, 'RPC_FALLBACK'),
            error: true,
            errorMsg: compactErrorMessage(result.reason),
            updatedAt: now,
          } satisfies ChainBalance;
        });

        setBalances(updated);
        setTotalUSD(total);
        setSource('RPC_FALLBACK');
        setLastUpdatedAt(now);
      } catch (error) {
        console.warn(`[useMultiChainBalance] unexpected error: ${compactErrorMessage(error)}`);
        const now = Date.now();
        setBalances((current) =>
          current.map((item) => ({
            ...item,
            isLoading: false,
            error: true,
            errorMsg: 'Balance provider unavailable',
            source: 'UNAVAILABLE',
            updatedAt: now,
          })),
        );
        setSource('UNAVAILABLE');
        setLastUpdatedAt(now);
      } finally {
        if (manual) setIsRefreshing(false);
      }
    },
    [address],
  );

  useEffect(() => {
    fetchAll();
    const timer = setInterval(() => fetchAll(), 30_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const fundingSources = useMemo(
    () => [...balances].filter((item) => item.rawBalance > 0n && !item.error).sort((a, b) => Number(b.rawBalance - a.rawBalance)),
    [balances],
  );

  return {
    balances,
    totalUSD,
    isRefreshing,
    refresh: () => fetchAll(true),
    source,
    lastUpdatedAt,
    errorCount: balances.filter((item) => item.error).length,
    fundingSources,
    largestFundingSource: fundingSources[0] ?? null,
  };
}

// store/walletStore.ts
// Global state for the connected wallet. Private key lives in SecureStore, not here.

import { create } from 'zustand';
import type { CachedTransaction } from '@/utils/storage';
import { SUPPORTED_ARC_TESTNET_TOKENS, type SupportedArcTokenSymbol } from '@/constants/tokens';

export interface TokenBalanceState {
  symbol: SupportedArcTokenSymbol;
  raw: bigint | null;
  formatted: string;
  isLoading: boolean;
  error: string | null;
  updatedAt: number | null;
}

export type TokenBalanceMap = Record<SupportedArcTokenSymbol, TokenBalanceState>;

function createInitialTokenBalances(): TokenBalanceMap {
  return SUPPORTED_ARC_TESTNET_TOKENS.reduce((acc, token) => {
    acc[token.symbol] = {
      symbol: token.symbol,
      raw: null,
      formatted: '0.00',
      isLoading: false,
      error: null,
      updatedAt: null,
    };
    return acc;
  }, {} as TokenBalanceMap);
}

interface WalletState {
  // Identity
  address: `0x${string}` | null;
  isLoaded: boolean;

  // Backward-compatible primary USDC balance
  usdcBalance: bigint;
  usdcBalanceFormatted: string;
  isBalanceLoading: boolean;

  // Arc Testnet asset balances
  tokenBalances: TokenBalanceMap;

  // Transactions
  transactions: CachedTransaction[];
  isTransactionsLoading: boolean;

  // UI
  hideBalance: boolean;

  // Actions
  setAddress: (address: `0x${string}` | null) => void;
  setBalance: (raw: bigint, formatted: string) => void;
  setTokenBalance: (symbol: SupportedArcTokenSymbol, update: Partial<TokenBalanceState>) => void;
  setAllTokenBalances: (balances: TokenBalanceMap) => void;
  setBalanceLoading: (v: boolean) => void;
  setTransactions: (txs: CachedTransaction[]) => void;
  setTransactionsLoading: (v: boolean) => void;
  setHideBalance: (v: boolean) => void;
  setLoaded: (v: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  address: null,
  isLoaded: false,
  usdcBalance: 0n,
  usdcBalanceFormatted: '0.00',
  isBalanceLoading: false,
  tokenBalances: createInitialTokenBalances(),
  transactions: [],
  isTransactionsLoading: false,
  hideBalance: false,
};

export const useWalletStore = create<WalletState>((set) => ({
  ...INITIAL,

  setAddress: (address) => set({ address }),
  setBalance: (usdcBalance, usdcBalanceFormatted) =>
    set({ usdcBalance, usdcBalanceFormatted }),
  setTokenBalance: (symbol, update) =>
    set((state) => ({
      tokenBalances: {
        ...state.tokenBalances,
        [symbol]: { ...state.tokenBalances[symbol], ...update },
      },
    })),
  setAllTokenBalances: (tokenBalances) => set({ tokenBalances }),
  setBalanceLoading: (isBalanceLoading) => set({ isBalanceLoading }),
  setTransactions: (transactions) => set({ transactions }),
  setTransactionsLoading: (isTransactionsLoading) =>
    set({ isTransactionsLoading }),
  setHideBalance: (hideBalance) => set({ hideBalance }),
  setLoaded: (isLoaded) => set({ isLoaded }),
  reset: () =>
    set({
      ...INITIAL,
      tokenBalances: createInitialTokenBalances(),
      isLoaded: true,
    }),
}));

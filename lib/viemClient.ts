// lib/viemClient.ts — v1.2.0
// ─────────────────────────────────────────────────────────────────────────────
// Viem public + wallet clients for Arc Testnet.
// FIXES:
//  • RPC URL validation with console warning when env var missing
//  • resetPublicClient() so callers can force reconnect after error
//  • createPublicClientForChain() for multi-chain reads
// ─────────────────────────────────────────────────────────────────────────────

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from '@/constants/chains';

// ─── RPC URL with fallback ────────────────────────────────────────────────────

const PRIMARY_RPC   = process.env.EXPO_PUBLIC_ARC_RPC_URL ?? '';
const FALLBACK_RPCS = [
  'https://rpc.testnet.arc.network',
  'https://arc-testnet.rpc.thirdweb.com',
];

function getArcRpc(): string {
  if (PRIMARY_RPC && PRIMARY_RPC.startsWith('http')) return PRIMARY_RPC;
  console.warn(
    '[viemClient] EXPO_PUBLIC_ARC_RPC_URL is not set or invalid. ' +
    `Falling back to: ${FALLBACK_RPCS[0]}`
  );
  return FALLBACK_RPCS[0];
}

// ─── Singleton public client ──────────────────────────────────────────────────

let _publicClient: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(getArcRpc(), {
        timeout:    10_000,
        retryCount: 2,
        retryDelay: 1_000,
      }),
    });
  }
  return _publicClient;
}

// ✅ FIX: Allow callers to reset singleton after RPC errors so next
// call rebuilds the client (e.g. after network reconnect).
export function resetPublicClient(): void {
  _publicClient = null;
}

// ✅ NEW: Create a standalone client for any chain by RPC URL.
// Used by useMultiChainBalance — avoids missing `chain` context errors.
export function createPublicClientForChain(
  rpcUrl:  string,
  chainDef?: Parameters<typeof createPublicClient>[0]['chain'],
): PublicClient {
  return createPublicClient({
    chain: chainDef,
    transport: http(rpcUrl, {
      timeout:    8_000,
      // ✅ FIX: retryCount 1 instead of 2 — avoids 24s worst-case on bad RPCs.
      // Callers should handle failure and show error/0 quickly.
      retryCount: 1,
      retryDelay: 800,
    }),
  });
}

// ─── Wallet client factory ────────────────────────────────────────────────────

export function createArcWalletClient(privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain:     arcTestnet,
    transport: http(getArcRpc(), {
      timeout:    15_000,
      retryCount: 2,
      retryDelay: 1_000,
    }),
  });
}

// ─── ERC-20 ABI ───────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '',        type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from',  type: 'address', indexed: true  },
      { name: 'to',    type: 'address', indexed: true  },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

// services/arcHealthService.ts
// Lightweight Arc Testnet RPC health check for testnet readiness and support debug.

import { getPublicClient, resetPublicClient } from '@/lib/viemClient';
import { ARC_TESTNET_DEFAULTS, arcTestnet } from '@/constants/chains';

export type ArcHealthStatus = 'unknown' | 'checking' | 'online' | 'degraded' | 'offline';

export interface ArcRpcHealth {
  status: ArcHealthStatus;
  chainId: number;
  expectedChainId: number;
  rpcUrl: string;
  explorerUrl: string;
  latencyMs?: number;
  blockNumber?: string;
  checkedAt: number;
  message: string;
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`RPC timed out after ${ms}ms`)), ms)),
  ]);
}

function compactError(error: unknown) {
  const raw = (error as any)?.shortMessage ?? (error as any)?.message ?? String(error ?? 'Unknown error');
  return raw.split('\n')[0].slice(0, 180);
}

export async function checkArcRpcHealth(timeoutMs = 6_500): Promise<ArcRpcHealth> {
  const checkedAt = Date.now();
  const startedAt = Date.now();
  const rpcUrl = process.env.EXPO_PUBLIC_ARC_RPC_URL ?? ARC_TESTNET_DEFAULTS.RPC_URL;
  const explorerUrl = process.env.EXPO_PUBLIC_ARC_EXPLORER ?? ARC_TESTNET_DEFAULTS.EXPLORER_URL;

  try {
    const client = getPublicClient();
    const [chainId, blockNumber] = await timeout(
      Promise.all([client.getChainId(), client.getBlockNumber()]),
      timeoutMs,
    );
    const latencyMs = Date.now() - startedAt;
    const expectedChainId = arcTestnet.id;
    const chainMatches = chainId === expectedChainId;

    return {
      status: chainMatches && latencyMs < 4_000 ? 'online' : 'degraded',
      chainId,
      expectedChainId,
      rpcUrl,
      explorerUrl,
      latencyMs,
      blockNumber: blockNumber.toString(),
      checkedAt,
      message: chainMatches
        ? `Arc RPC reached block ${blockNumber.toString()} in ${latencyMs}ms.`
        : `Connected to chain ${chainId}, expected Arc Testnet ${expectedChainId}.`,
    };
  } catch (error) {
    resetPublicClient();
    return {
      status: 'offline',
      chainId: 0,
      expectedChainId: arcTestnet.id,
      rpcUrl,
      explorerUrl,
      checkedAt,
      message: compactError(error),
    };
  }
}

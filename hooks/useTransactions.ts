import { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPublicClient, ERC20_ABI } from '@/lib/viemClient';
import { TOKEN_ADDRESSES } from '@/constants/chains';
import {
  saveCachedTransactions,
  loadCachedTransactions,
  type CachedTransaction,
} from '@/utils/storage';
import { useWalletStore } from '@/store/walletStore';
import { formatUsdc } from '@/utils/format';

interface BridgeJob {
  id: string;
  burnTxHash?: string;
  destAddress: string;
  amount: string;
  status: string;
  createdAt: number;
}

interface FaucetResult {
  txHash?: string;
  amount: string;
  chainId: number;
  timestamp: number;
  status: string;
}

const TX_LOOKBACK_BLOCKS = 2_000n;

function compactErrorMessage(error: unknown): string {
  const raw = (error as any)?.shortMessage || (error as any)?.message || String(error || 'Unknown error');
  const firstLine = raw.split('\n')[0]?.trim() || 'Unknown error';

  if (firstLine.includes('404')) return 'RPC endpoint returned 404';
  if (firstLine.toLowerCase().includes('timed out')) return 'RPC request timed out';
  if (firstLine.toLowerCase().includes('fetch failed')) return 'RPC request failed';

  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
}

async function buildOnChainTransactions(address: `0x${string}`): Promise<CachedTransaction[]> {
  const client = getPublicClient();
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > TX_LOOKBACK_BLOCKS ? latestBlock - TX_LOOKBACK_BLOCKS : 0n;
  const transferEvent = ERC20_ABI.find((item: any) => item.type === 'event' && item.name === 'Transfer') as any;

  const [sentLogs, receivedLogs] = await Promise.all([
    client.getLogs({
      address: TOKEN_ADDRESSES.ARC_USDC,
      event: transferEvent,
      args: { from: address },
      fromBlock,
      toBlock: 'latest',
    }),
    client.getLogs({
      address: TOKEN_ADDRESSES.ARC_USDC,
      event: transferEvent,
      args: { to: address },
      fromBlock,
      toBlock: 'latest',
    }),
  ]);

  const logs = [...sentLogs, ...receivedLogs].filter((log) => log.transactionHash && log.blockNumber);
  const blockNumbers = Array.from(new Set(logs.map((log) => log.blockNumber!.toString())));
  const blockTimestamps = new Map<string, number>();

  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
      blockTimestamps.set(blockNumber, Number(block.timestamp));
    }),
  );

  const normalizedAddress = address.toLowerCase();

  return logs.map((log) => {
    const args = (log as any).args ?? {};
    const from = String(args.from ?? '').toLowerCase();
    const value = (args.value ?? 0n) as bigint;
    const isSend = from === normalizedAddress;
    const timestamp = blockTimestamps.get(log.blockNumber!.toString()) ?? Math.floor(Date.now() / 1000);

    return {
      hash: log.transactionHash!,
      from: String(args.from ?? ''),
      to: String(args.to ?? ''),
      value: formatUsdc(value),
      timestamp,
      status: 'success',
      type: isSend ? 'send' : 'receive',
    } satisfies CachedTransaction;
  });
}

export function useTransactions() {
  const { address, setTransactions, setTransactionsLoading } = useWalletStore();

  const fetchTransactions = useCallback(async () => {
    if (!address) {
      setTransactionsLoading(false);
      return;
    }

    setTransactionsLoading(true);

    try {
      const cached = await loadCachedTransactions(address);
      if (cached.length > 0) {
        setTransactions(cached);
      }

      const onChainTxs = await buildOnChainTransactions(address);
      const rawBridge = await AsyncStorage.getItem('tpay_bridge_jobs_v1');
      const bridgeJobs: BridgeJob[] = rawBridge ? JSON.parse(rawBridge) : [];
      const rawFaucet = await AsyncStorage.getItem('tpay_faucet_history_v1');
      const faucetHistory: FaucetResult[] = rawFaucet ? JSON.parse(rawFaucet) : [];

      const bridgeTxs: CachedTransaction[] = bridgeJobs
        .filter((job) => Boolean(job.burnTxHash) && (job.status === 'success' || job.status === 'failed'))
        .map((job) => ({
          hash: job.burnTxHash!,
          from: address,
          to: job.destAddress,
          value: job.amount,
          timestamp: Math.floor(job.createdAt / 1000),
          status: job.status === 'success' ? 'success' : 'failed',
          type: 'bridge' as const,
        }));

      const faucetTxs: CachedTransaction[] = faucetHistory
        .filter(
          (faucet) =>
            faucet.status === 'success' &&
            Boolean(faucet.txHash) &&
            faucet.chainId === Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? 5042002),
        )
        .map((faucet) => ({
          hash: faucet.txHash!,
          from: 'faucet',
          to: address,
          value: faucet.amount,
          timestamp: Math.floor(faucet.timestamp / 1000),
          status: faucet.status === 'success' ? 'success' : 'failed',
          type: 'receive' as const,
        }));

      const seen = new Set<string>();
      const merged = [...onChainTxs, ...bridgeTxs, ...faucetTxs, ...cached]
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter((tx) => {
          if (seen.has(tx.hash)) return false;
          seen.add(tx.hash);
          return true;
        })
        .slice(0, 50);

      setTransactions(merged);
      await saveCachedTransactions(address, merged);
    } catch (error) {
      console.warn('[useTransactions] fetch error:', compactErrorMessage(error));
    } finally {
      setTransactionsLoading(false);
    }
  }, [address, setTransactions, setTransactionsLoading]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return { refetch: fetchTransactions };
}

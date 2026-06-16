// services/bridgeService.ts - App Kit bridge job tracker
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Hex } from 'viem';
import { createArcWalletClient, getPublicClient, ERC20_ABI } from '@/lib/viemClient';
import { TOKEN_ADDRESSES, type BridgeChain } from '@/constants/chains';
import { initiateBridge } from '@/lib/arcAppKit';
import { loadPrivateKey } from '@/lib/wallet';
import { parseUsdc, formatUsdc } from '@/utils/format';


export type BridgeStatus =
  | 'idle' | 'signing' | 'burning' | 'attesting' | 'minting' | 'success' | 'failed';

export interface BridgeJob {
  id:           string;
  fromChainId:  number;
  toChain:      BridgeChain;
  amount:       string;
  destAddress:  string;
  status:       BridgeStatus;
  burnTxHash?:  string;
  mintTxHash?:  string;
  attestation?: string;
  error?:       string;
  createdAt:    number;
  updatedAt:    number;
  estimatedMs:  number;
}

export type BridgeStatusListener = (job: BridgeJob) => void;

const STORAGE_KEY       = 'tpay_bridge_jobs_v1';
const BRIDGE_TIMEOUT_MS = 120_000;

const CHAIN_ETA_MS: Record<number, number> = {
  84532:    25_000,
  11155111: 40_000,
  421614:   30_000,
  80002:    35_000,
};

function makeJobId(): string {
  return `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


async function loadJobs(): Promise<BridgeJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BridgeJob[]) : [];
  } catch { return []; }
}

async function saveJob(job: BridgeJob): Promise<void> {
  try {
    const jobs  = await loadJobs();
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.unshift(job);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 50)));
  } catch {}
}

class BridgeService {
  private listeners = new Map<string, BridgeStatusListener[]>();

  subscribe(jobId: string, cb: BridgeStatusListener): () => void {
    const list = this.listeners.get(jobId) ?? [];
    list.push(cb);
    this.listeners.set(jobId, list);
    return () => {
      const updated = (this.listeners.get(jobId) ?? []).filter((x) => x !== cb);
      this.listeners.set(jobId, updated);
    };
  }

  private emit(job: BridgeJob) {
    (this.listeners.get(job.id) ?? []).forEach((cb) => cb(job));
  }

  private async update(job: BridgeJob, patch: Partial<BridgeJob>): Promise<BridgeJob> {
    const updated = { ...job, ...patch, updatedAt: Date.now() };
    await saveJob(updated);
    this.emit(updated);
    return updated;
  }

  async getJobs(): Promise<BridgeJob[]> {
    return loadJobs();
  }

  getEstimatedMs(toChainId: number): number {
    return CHAIN_ETA_MS[toChainId] ?? 35_000;
  }

  async bridgeUSDC(
    toChain:     BridgeChain,
    amount:      string,
    destAddress: string,
    onStatus?:   BridgeStatusListener,
  ): Promise<BridgeJob> {
    let job: BridgeJob = {
      id:          makeJobId(),
      fromChainId: Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? 5042002),
      toChain,
      amount,
      destAddress,
      status:      'idle',
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      estimatedMs: this.getEstimatedMs(toChain.id),
    };

    await saveJob(job);
    if (onStatus) this.subscribe(job.id, onStatus);

    let timedOut = false;
    const timeoutHandle = setTimeout(async () => {
      timedOut = true;
      if (job.status !== 'success' && job.status !== 'failed') {
        job = await this.update(job, {
          status: 'failed',
          error:  `Bridge timed out after ${BRIDGE_TIMEOUT_MS / 1000}s. Please retry.`,
        });
      }
    }, BRIDGE_TIMEOUT_MS);

    try {
      job = await this.update(job, { status: 'signing' });

      const pk = await loadPrivateKey();
      if (!pk) throw new Error('Wallet not found. Please re-import your wallet.');
      if (timedOut) return job;

      const amountBig = parseUsdc(amount);
      if (amountBig <= 0n) throw new Error('Amount must be greater than 0.');

      const publicClient = getPublicClient();
      const walletClient = createArcWalletClient(pk as Hex);
      const account      = walletClient.account!;

      const balance = await publicClient.readContract({
        address:      TOKEN_ADDRESSES.ARC_USDC,
        abi:          ERC20_ABI,
        functionName: 'balanceOf',
        args:         [account.address],
      }) as bigint;

      if (amountBig > balance) {
        throw new Error(
          `Insufficient balance: you have ${formatUsdc(balance)} USDC but tried to bridge ${amount} USDC.`
        );
      }
      if (timedOut) return job;

      job = await this.update(job, { status: 'burning' });
      const burnHash = await initiateBridge(pk, toChain.id, destAddress, amountBig);
      if (timedOut) return job;

      job = await this.update(job, {
        burnTxHash: burnHash,
        status: 'success',
      });
      return job;

    } catch (e: any) {
      if (timedOut) return job;
      const error = e?.shortMessage ?? e?.message ?? 'Bridge failed. Please try again.';
      console.error('[bridgeService] error:', error);
      job = await this.update(job, { status: 'failed', error });
      return job;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async retryJob(jobId: string, onStatus?: BridgeStatusListener): Promise<BridgeJob | null> {
    const jobs = await loadJobs();
    const job  = jobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'failed') return null;
    return this.bridgeUSDC(job.toChain, job.amount, job.destAddress, onStatus);
  }
}

export const bridgeService = new BridgeService();


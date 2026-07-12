import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Hex } from 'viem';
import { CONTRACT_ADDRESSES, INTERVAL_PRESETS, RECURRING_ABI, USDC_DECIMALS, isRecurringConfigured } from '@/constants/contracts';
import { TOKEN_ADDRESSES } from '@/constants/chains';
import { createArcWalletClient, ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { waitForSuccessfulReceipt } from '@/lib/transactionReceipt';
import { loadPrivateKey } from '@/lib/wallet';
import { parseUsdc } from '@/utils/format';

const CACHE_PREFIX = 'tpay_subscriptions_v1_';
const DEFAULT_APPROVAL_CYCLES = 12n;

export interface Subscription {
  id: number;
  payer: string;
  payee: string;
  amount: number;
  amountRaw: bigint;
  interval: number;
  intervalLabel: string;
  nextPaymentAt: Date;
  endAt: Date | null;
  totalPaid: number;
  paymentsCount: number;
  active: boolean;
  label: string;
  isDue: boolean;
}

export interface CreateSubParams {
  payee: string;
  amount: string;
  interval: number;
  startAt?: number;
  endAt?: number;
  label: string;
}

export type ServiceResult<T> =
  | { success: true; data: T; txHash?: string }
  | { success: false; error: string };

function recurringAddress() {

  if (!isRecurringConfigured()) {
    throw new Error('RecurringPayments contract is not configured. Set EXPO_PUBLIC_RECURRING_ADDRESS first.');
  }
  return CONTRACT_ADDRESSES.RECURRING_PAYMENTS as `0x${string}`;
}

function cacheKey(address: string) {
  return `${CACHE_PREFIX}${address.toLowerCase()}`;
}

class RecurringService {
  private async getClients() {
    const privateKey = await loadPrivateKey();
    if (!privateKey) {
      throw new Error('Wallet not found. Please create or import a wallet first.');
    }

    const walletClient = createArcWalletClient(privateKey as Hex);
    const publicClient = getPublicClient();
    const account = walletClient.account;

    if (!account) {
      throw new Error('Wallet account is not available.');
    }

    return { walletClient, publicClient, account };
  }

  private intervalLabel(seconds: number) {
    const preset = INTERVAL_PRESETS.find((item) => item.seconds === seconds);
    if (preset) return preset.label;

    const days = Math.max(1, Math.round(seconds / 86_400));
    return `Every ${days} day${days > 1 ? 's' : ''}`;
  }

  private toSubscription(id: number, raw: any, isDue: boolean): Subscription {
    const amountRaw = raw.amount as bigint;

    return {
      id,
      payer: raw.payer as string,
      payee: raw.payee as string,
      amount: Number(amountRaw) / 10 ** USDC_DECIMALS,
      amountRaw,
      interval: Number(raw.interval),
      intervalLabel: this.intervalLabel(Number(raw.interval)),
      nextPaymentAt: new Date(Number(raw.nextPaymentAt) * 1000),
      endAt: raw.endAt === 0n ? null : new Date(Number(raw.endAt) * 1000),
      totalPaid: Number(raw.totalPaid as bigint) / 10 ** USDC_DECIMALS,
      paymentsCount: Number(raw.paymentsCount),
      active: Boolean(raw.active),
      label: String(raw.label || 'Recurring payment'),
      isDue,
    };
  }

  private async persist(address: string, subscriptions: Subscription[]) {
    await AsyncStorage.setItem(
      cacheKey(address),
      JSON.stringify(
        subscriptions.map((item) => ({
          ...item,
          amountRaw: item.amountRaw.toString(),
          nextPaymentAt: item.nextPaymentAt.toISOString(),
          endAt: item.endAt?.toISOString() ?? null,
        })),
      ),
    );
  }

  async loadCached(address: string): Promise<Subscription[]> {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(address));
      if (!raw) return [];

      return (JSON.parse(raw) as any[]).map((item) => ({
        ...item,
        amountRaw: BigInt(item.amountRaw ?? '0'),
        nextPaymentAt: new Date(item.nextPaymentAt),
        endAt: item.endAt ? new Date(item.endAt) : null,
      }));
    } catch {
      return [];
    }
  }

  async loadSubscriptions(address: string): Promise<Subscription[]> {
    if (!isRecurringConfigured()) {
      return this.loadCached(address);
    }

    const publicClient = getPublicClient();
    const contractAddress = recurringAddress();

    const ids = (await publicClient.readContract({
      address: contractAddress,
      abi: RECURRING_ABI,
      functionName: 'getPayerSubscriptions',
      args: [address as `0x${string}`],
    })) as bigint[];

    const subscriptions = await Promise.all(
      ids.map(async (id) => {
        const [raw, isDue] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: RECURRING_ABI,
            functionName: 'getSubscription',
            args: [id],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: RECURRING_ABI,
            functionName: 'isDue',
            args: [id],
          }),
        ]);

        return this.toSubscription(Number(id), raw, Boolean(isDue));
      }),
    );

    const sorted = subscriptions.sort((a, b) => b.id - a.id);
    await this.persist(address, sorted);
    return sorted;
  }

  private async ensureUsdcApproval(requiredAllowance: bigint) {
    const { walletClient, publicClient, account } = await this.getClients();
    const contractAddress = recurringAddress();

    const allowance = (await publicClient.readContract({
      address: TOKEN_ADDRESSES.ARC_USDC,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, contractAddress],
    })) as bigint;

    if (allowance >= requiredAllowance) return;

    const hash = await walletClient.writeContract({
      account,
      chain: null,
      address: TOKEN_ADDRESSES.ARC_USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, requiredAllowance],
    });

    await waitForSuccessfulReceipt(publicClient, hash);
  }

  private async latestSubscriptionId(payer: `0x${string}`) {
    const publicClient = getPublicClient();
    const ids = (await publicClient.readContract({
      address: recurringAddress(),
      abi: RECURRING_ABI,
      functionName: 'getPayerSubscriptions',
      args: [payer],
    })) as bigint[];

    return ids.length > 0 ? Number(ids[ids.length - 1]) : -1;
  }

  async createSubscription(params: CreateSubParams): Promise<ServiceResult<{ subId: number }>> {
    try {
      const amountRaw = parseUsdc(params.amount);
      await this.ensureUsdcApproval(amountRaw * DEFAULT_APPROVAL_CYCLES);

      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'createSubscription',
        args: [
          params.payee as `0x${string}`,
          amountRaw,
          BigInt(params.interval),
          BigInt(params.startAt ?? 0),
          BigInt(params.endAt ?? 0),
          params.label.trim(),
        ],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      const subId = await this.latestSubscriptionId(account.address);
      return { success: true, data: { subId }, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to create subscription.' };
    }
  }

  async cancelSubscription(subId: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'cancelSubscription',
        args: [BigInt(subId)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to cancel subscription.' };
    }
  }

  async pauseSubscription(subId: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'pauseSubscription',
        args: [BigInt(subId)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to pause subscription.' };
    }
  }

  async resumeSubscription(subId: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'resumeSubscription',
        args: [BigInt(subId)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to resume subscription.' };
    }
  }

  async triggerPayment(subId: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const raw = (await publicClient.readContract({
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'getSubscription',
        args: [BigInt(subId)],
      })) as any;

      await this.ensureUsdcApproval((raw.amount as bigint) * DEFAULT_APPROVAL_CYCLES);

      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: recurringAddress(),
        abi: RECURRING_ABI,
        functionName: 'executePayment',
        args: [BigInt(subId)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to trigger payment.' };
    }
  }
}

export const recurringService = new RecurringService();



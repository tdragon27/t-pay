import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Hex } from 'viem';
import { CONTRACT_ADDRESSES, INVOICE_ABI, INVOICE_STATUS, USDC_DECIMALS, ZERO_ADDRESS, isInvoiceConfigured, type InvoiceStatus } from '@/constants/contracts';
import { TOKEN_ADDRESSES } from '@/constants/chains';
import { createArcWalletClient, ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { waitForSuccessfulReceipt } from '@/lib/transactionReceipt';
import { loadPrivateKey } from '@/lib/wallet';
import { parseUsdc } from '@/utils/format';

const META_PREFIX = 'tpay_invoice_meta_v1_';
const CREATOR_CACHE_PREFIX = 'tpay_invoices_v1_';
const INDEX_CACHE_KEY = 'tpay_invoices_index_v1';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export type DisplayCurrency = 'USD' | 'VND' | 'EUR';

export interface InvoiceMeta {
  issuerName: string;
  clientName: string;
  clientEmail?: string;
  lineItems: LineItem[];
  displayCurrency: DisplayCurrency;
  exchangeRate: number;
  notes?: string;
}

export interface Invoice {
  id: number;
  creator: string;
  payer: string;
  amountUsdc: number;
  dueAt: Date | null;
  paidAt: Date | null;
  status: InvoiceStatus;
  metadataCid: string;
  invoiceNumber: string;
  meta?: InvoiceMeta;
  lastReminder?: Date;
}

export interface CreateInvoiceParams {
  payerAddress?: string;
  amountUsdc: number;
  dueAt?: Date;
  invoiceNumber: string;
  meta: InvoiceMeta;
}

export type ServiceResult<T> =
  | { success: true; data: T; txHash?: string }
  | { success: false; error: string };

function invoiceAddress() {

  if (!isInvoiceConfigured()) {
    throw new Error('InvoiceManager contract is not configured. Set EXPO_PUBLIC_INVOICE_ADDRESS first.');
  }
  return CONTRACT_ADDRESSES.INVOICE_MANAGER as `0x${string}`;
}

function creatorCacheKey(address: string) {
  return `${CREATOR_CACHE_PREFIX}${address.toLowerCase()}`;
}

function normalizeStatus(status: InvoiceStatus, dueAt: Date | null, paidAt: Date | null) {
  if (status === 'Pending' && !paidAt && dueAt && dueAt.getTime() < Date.now()) {
    return 'Overdue' as const;
  }
  return status;
}

class InvoiceService {
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

  private async ensureUsdcApproval(amountRaw: bigint) {
    const { walletClient, publicClient, account } = await this.getClients();
    const contractAddress = invoiceAddress();

    const allowance = (await publicClient.readContract({
      address: TOKEN_ADDRESSES.ARC_USDC,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, contractAddress],
    })) as bigint;

    if (allowance >= amountRaw) return;

    const hash = await walletClient.writeContract({
      account,
      chain: null,
      address: TOKEN_ADDRESSES.ARC_USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, amountRaw],
    });

    await waitForSuccessfulReceipt(publicClient, hash);
  }

  private async saveMeta(metadataCid: string, meta: InvoiceMeta) {
    await AsyncStorage.setItem(`${META_PREFIX}${metadataCid}`, JSON.stringify(meta));
  }

  private async loadMeta(metadataCid: string): Promise<InvoiceMeta | undefined> {
    try {
      const raw = await AsyncStorage.getItem(`${META_PREFIX}${metadataCid}`);
      return raw ? (JSON.parse(raw) as InvoiceMeta) : undefined;
    } catch {
      return undefined;
    }
  }

  private serialize(invoices: Invoice[]) {
    return invoices.map((invoice) => ({
      ...invoice,
      dueAt: invoice.dueAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      lastReminder: invoice.lastReminder?.toISOString() ?? null,
    }));
  }

  private deserialize(items: any[]): Invoice[] {
    return items.map((invoice) => ({
      ...invoice,
      dueAt: invoice.dueAt ? new Date(invoice.dueAt) : null,
      paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
      lastReminder: invoice.lastReminder ? new Date(invoice.lastReminder) : undefined,
    }));
  }

  private async readInvoiceIndex(): Promise<Invoice[]> {
    try {
      const raw = await AsyncStorage.getItem(INDEX_CACHE_KEY);
      if (!raw) return [];
      return this.deserialize(JSON.parse(raw) as any[]);
    } catch {
      return [];
    }
  }

  private async writeInvoiceIndex(invoices: Invoice[]) {
    const next = [...invoices].sort((a, b) => b.id - a.id);
    await AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(this.serialize(next)));
  }

  private async upsertInvoiceIndex(invoices: Invoice[]) {
    const current = await this.readInvoiceIndex();
    const map = new Map<number, Invoice>();

    for (const invoice of current) map.set(invoice.id, invoice);
    for (const invoice of invoices) map.set(invoice.id, invoice);

    await this.writeInvoiceIndex(Array.from(map.values()));
  }

  private toInvoice(id: number, raw: any, meta?: InvoiceMeta, lastReminderRaw?: bigint): Invoice {
    const dueAt = raw.dueAt === 0n ? null : new Date(Number(raw.dueAt) * 1000);
    const paidAt = raw.paidAt === 0n ? null : new Date(Number(raw.paidAt) * 1000);
    const status = INVOICE_STATUS[Number(raw.status)] ?? 'Pending';

    return {
      id,
      creator: raw.creator as string,
      payer: raw.payer === ZERO_ADDRESS ? '' : (raw.payer as string),
      amountUsdc: Number(raw.amountUsdc as bigint) / 10 ** USDC_DECIMALS,
      dueAt,
      paidAt,
      status: normalizeStatus(status, dueAt, paidAt),
      metadataCid: String(raw.metadataCid),
      invoiceNumber: String(raw.invoiceNumber),
      meta,
      lastReminder:
        lastReminderRaw && lastReminderRaw > 0n ? new Date(Number(lastReminderRaw) * 1000) : undefined,
    };
  }

  async loadCached(address: string): Promise<Invoice[]> {
    try {
      const raw = await AsyncStorage.getItem(creatorCacheKey(address));
      if (!raw) return [];
      return this.deserialize(JSON.parse(raw) as any[]);
    } catch {
      return [];
    }
  }

  async loadCreatorInvoices(address: string): Promise<Invoice[]> {
    if (!isInvoiceConfigured()) {
      return this.loadCached(address);
    }

    const publicClient = getPublicClient();
    const ids = (await publicClient.readContract({
      address: invoiceAddress(),
      abi: INVOICE_ABI,
      functionName: 'getCreatorInvoices',
      args: [address as `0x${string}`],
    })) as bigint[];

    const invoices = await Promise.all(
      ids.map(async (id) => {
        const [raw, lastReminderRaw] = await Promise.all([
          publicClient.readContract({
            address: invoiceAddress(),
            abi: INVOICE_ABI,
            functionName: 'getInvoice',
            args: [id],
          }),
          publicClient.readContract({
            address: invoiceAddress(),
            abi: INVOICE_ABI,
            functionName: 'lastReminderAt',
            args: [id],
          }),
        ]);

        const meta = await this.loadMeta((raw as any).metadataCid as string);
        return this.toInvoice(Number(id), raw, meta, lastReminderRaw as bigint);
      }),
    );

    const sorted = invoices.sort((a, b) => b.id - a.id);
    await AsyncStorage.setItem(creatorCacheKey(address), JSON.stringify(this.serialize(sorted)));
    await this.upsertInvoiceIndex(sorted);
    return sorted;
  }

  async fetchInvoice(id: number): Promise<Invoice | null> {
    const indexed = await this.readInvoiceIndex();
    const cached = indexed.find((invoice) => invoice.id === id) ?? null;

    if (!isInvoiceConfigured()) {
      return cached;
    }

    try {
      const publicClient = getPublicClient();
      const [raw, lastReminderRaw] = await Promise.all([
        publicClient.readContract({
          address: invoiceAddress(),
          abi: INVOICE_ABI,
          functionName: 'getInvoice',
          args: [BigInt(id)],
        }),
        publicClient.readContract({
          address: invoiceAddress(),
          abi: INVOICE_ABI,
          functionName: 'lastReminderAt',
          args: [BigInt(id)],
        }),
      ]);

      if ((raw as any).creator === ZERO_ADDRESS) {
        return cached;
      }

      const meta = await this.loadMeta((raw as any).metadataCid as string);
      const invoice = this.toInvoice(id, raw, meta, lastReminderRaw as bigint);
      await this.upsertInvoiceIndex([invoice]);
      return invoice;
    } catch {
      return cached;
    }
  }

  private async latestInvoiceId(creator: `0x${string}`) {
    const publicClient = getPublicClient();
    const ids = (await publicClient.readContract({
      address: invoiceAddress(),
      abi: INVOICE_ABI,
      functionName: 'getCreatorInvoices',
      args: [creator],
    })) as bigint[];

    return ids.length > 0 ? Number(ids[ids.length - 1]) : -1;
  }

  async createInvoice(params: CreateInvoiceParams): Promise<ServiceResult<{ invoiceId: number }>> {
    try {
      const metadataCid = `local_${params.invoiceNumber.replace(/\s+/g, '_')}_${Date.now()}`;
      await this.saveMeta(metadataCid, params.meta);

      const { walletClient, publicClient, account } = await this.getClients();
      const amountRaw = parseUsdc(params.amountUsdc.toString());
      const dueAt = params.dueAt ? Math.floor(params.dueAt.getTime() / 1000) : 0;
      const payer = (params.payerAddress || ZERO_ADDRESS) as `0x${string}`;

      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: invoiceAddress(),
        abi: INVOICE_ABI,
        functionName: 'createInvoice',
        args: [payer, amountRaw, BigInt(dueAt), params.invoiceNumber.trim(), metadataCid],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      const invoiceId = await this.latestInvoiceId(account.address);

      if (invoiceId >= 0) {
        const created: Invoice = {
          id: invoiceId,
          creator: account.address,
          payer: payer === ZERO_ADDRESS ? '' : payer,
          amountUsdc: params.amountUsdc,
          dueAt: params.dueAt ?? null,
          paidAt: null,
          status: normalizeStatus('Pending', params.dueAt ?? null, null),
          metadataCid,
          invoiceNumber: params.invoiceNumber.trim(),
          meta: params.meta,
        };

        await this.upsertInvoiceIndex([created]);
        const cachedCreatorInvoices = await this.loadCached(account.address);
        await AsyncStorage.setItem(
          creatorCacheKey(account.address),
          JSON.stringify(this.serialize([created, ...cachedCreatorInvoices.filter((item) => item.id !== created.id)])),
        );
      }

      return { success: true, data: { invoiceId }, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to create invoice.' };
    }
  }

  async payInvoice(id: number, amountUsdc: number): Promise<ServiceResult<void>> {
    try {
      await this.ensureUsdcApproval(parseUsdc(amountUsdc.toString()));
      const { walletClient, publicClient, account } = await this.getClients();

      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: invoiceAddress(),
        abi: INVOICE_ABI,
        functionName: 'payInvoice',
        args: [BigInt(id)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      const next = await this.fetchInvoice(id);
      if (next) await this.upsertInvoiceIndex([next]);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Payment failed.' };
    }
  }

  async sendReminder(id: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: invoiceAddress(),
        abi: INVOICE_ABI,
        functionName: 'sendReminder',
        args: [BigInt(id)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      const next = await this.fetchInvoice(id);
      if (next) await this.upsertInvoiceIndex([next]);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to send reminder.' };
    }
  }

  async cancelInvoice(id: number): Promise<ServiceResult<void>> {
    try {
      const { walletClient, publicClient, account } = await this.getClients();
      const hash = await walletClient.writeContract({
        account,
        chain: null,
        address: invoiceAddress(),
        abi: INVOICE_ABI,
        functionName: 'cancelInvoice',
        args: [BigInt(id)],
      });

      await waitForSuccessfulReceipt(publicClient, hash);
      const next = await this.fetchInvoice(id);
      if (next) await this.upsertInvoiceIndex([next]);
      return { success: true, data: undefined, txHash: hash };
    } catch (error: any) {
      return { success: false, error: error?.shortMessage ?? error?.message ?? 'Failed to cancel invoice.' };
    }
  }
}

export const invoiceService = new InvoiceService();



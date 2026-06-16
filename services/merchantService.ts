import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ExpoLinking from 'expo-linking';
import { formatUnits, keccak256, parseUnits, stringToHex, toHex, type Hex } from 'viem';
import { ARC_CONTRACTS, FX_TOKENS, type FxExecutionMode, type FxTokenSymbol } from '@/constants/chains';
import { createArcWalletClient, ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { loadPrivateKey } from '@/lib/wallet';
import { executeFxSwap, getFxQuote, type FxQuote } from '@/services/fxService';
import { buildSmartQrLink } from '@/services/paymentRequestService';
import { recordPassportEvent } from '@/services/passportService';
import { notifyInvoiceCreated, notifyInvoicePaid } from '@/services/notificationService';
import { recordActivity } from '@/services/activityService';
import { upsertPaymentIntent } from '@/services/paymentIntentService';
import { assertRiskAllowed } from '@/services/riskService';
import { buildMerchantPaymentIntentId } from '@/utils/tpayLogic';

const MERCHANT_INVOICES_KEY = 'tpay_merchant_invoices_v2';
const DEFAULT_SYNC_INTERVAL_MS = 4_000;

export type MerchantInvoiceStatus = 'open' | 'paid' | 'cancelled' | 'expired';
export type MerchantSettlementMode = 'contract' | 'transfer' | 'local';

export interface MerchantInvoice {
  id: string;
  contractInvoiceId: Hex;
  merchantAddress: `0x${string}`;
  tokenSymbol: FxTokenSymbol;
  settlementTokenSymbol: FxTokenSymbol;
  amount: string;
  amountRaw: string;
  label: string;
  note?: string;
  displayCurrency: 'USD' | 'VND';
  displayAmount: string;
  status: MerchantInvoiceStatus;
  settleMode: MerchantSettlementMode;
  paymentLink: string;
  deepLink: string;
  qrValue: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  paidAt?: number;
  payerAddress?: `0x${string}`;
  payerTokenSymbol?: FxTokenSymbol;
  txHash?: string;
  swapTxHash?: string;
  blockTimestamp?: number;
  fxRate?: number;
  fxQuoteSource?: FxQuote['source'];
  feeAmount?: string;
  feeBps?: number;
}

export interface CreateMerchantInvoiceInput {
  merchantAddress: `0x${string}`;
  tokenSymbol: FxTokenSymbol;
  amount: string;
  label: string;
  note?: string;
  displayCurrency?: 'USD' | 'VND';
  displayAmount?: string;
  expiresInMinutes?: number;
  createOnchain?: boolean;
}

export interface PayMerchantInvoiceInput {
  invoiceId: string;
  payerTokenSymbol?: FxTokenSymbol;
  providerOverride?: FxExecutionMode;
}

export interface MerchantPaymentResult {
  txHash: string;
  mode: MerchantSettlementMode;
  invoice: MerchantInvoice;
  fxQuote?: FxQuote;
}

export const MERCHANT_SETTLEMENT_ABI = [
  {
    name: 'createInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'reference', type: 'string' },
      { name: 'currencyCode', type: 'string' },
      { name: 'metadataHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'payInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'cancelInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

function safeNotify(task: Promise<unknown>) {
  void task.catch(() => undefined);
}

function getBackendBaseUrl() {
  return process.env.EXPO_PUBLIC_TPAY_BACKEND_URL?.replace(/\/$/, '') ?? '';
}

function toInvoiceBytes32(invoiceId: string): Hex {
  return keccak256(toHex(invoiceId));
}

function randomHex(byteLength = 6) {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildInvoiceId(merchantAddress: string, now: number) {
  const merchantPrefix = merchantAddress.slice(2, 8).toLowerCase();
  return `inv_${now}_${merchantPrefix}_${randomHex()}`;
}

function buildDeepLink(invoice: Pick<MerchantInvoice, 'id' | 'merchantAddress' | 'amount' | 'tokenSymbol' | 'label'>) {
  return buildSmartQrLink({
    type: 'invoice',
    invoiceId: invoice.id,
    merchant: invoice.merchantAddress,
    amount: invoice.amount,
    token: invoice.tokenSymbol,
    label: invoice.label,
  });
}

function buildPaymentLink(invoice: Pick<MerchantInvoice, 'id' | 'merchantAddress' | 'amount' | 'tokenSymbol' | 'label'>) {
  return ExpoLinking.createURL('/pay', {
    queryParams: {
      invoiceId: invoice.id,
      merchant: invoice.merchantAddress,
      amount: invoice.amount,
      token: invoice.tokenSymbol,
      label: invoice.label,
    },
  });
}

function normalizeInvoiceStatus(status: MerchantInvoiceStatus, expiresAt: number) {
  if (status === 'open' && expiresAt <= Date.now()) {
    return 'expired' as const;
  }
  return status;
}

function normalizeInvoice(invoice: MerchantInvoice): MerchantInvoice {
  const normalized: MerchantInvoice = {
    ...invoice,
    settlementTokenSymbol: invoice.settlementTokenSymbol ?? invoice.tokenSymbol,
    updatedAt: invoice.updatedAt ?? invoice.createdAt,
    deepLink: invoice.deepLink ?? buildDeepLink(invoice),
    paymentLink: invoice.paymentLink ?? buildPaymentLink(invoice),
    qrValue: invoice.qrValue ?? invoice.deepLink ?? buildDeepLink(invoice),
  };

  return {
    ...normalized,
    status: normalizeInvoiceStatus(normalized.status, normalized.expiresAt),
  };
}

function mergeInvoices(primary: MerchantInvoice[], secondary: MerchantInvoice[]) {
  const map = new Map<string, MerchantInvoice>();

  for (const invoice of secondary) {
    map.set(invoice.id, normalizeInvoice(invoice));
  }
  for (const invoice of primary) {
    const previous = map.get(invoice.id);
    map.set(invoice.id, normalizeInvoice({ ...previous, ...invoice } as MerchantInvoice));
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

async function readLocalInvoicesRaw(): Promise<MerchantInvoice[]> {
  const raw = await AsyncStorage.getItem(MERCHANT_INVOICES_KEY);
  if (!raw) return [];

  try {
    return (JSON.parse(raw) as MerchantInvoice[]).map(normalizeInvoice);
  } catch {
    return [];
  }
}

async function saveInvoices(invoices: MerchantInvoice[]) {
  const normalized = invoices.map(normalizeInvoice);
  await AsyncStorage.setItem(MERCHANT_INVOICES_KEY, JSON.stringify(normalized));
}

async function saveOrReplaceInvoice(invoice: MerchantInvoice) {
  const current = await readLocalInvoicesRaw();
  const next = mergeInvoices([invoice], current);
  await saveInvoices(next);
  return normalizeInvoice(invoice);
}

async function fetchBackendInvoicesByMerchant(merchantAddress: string): Promise<MerchantInvoice[]> {
  const backendUrl = getBackendBaseUrl();
  if (!backendUrl) return [];

  try {
    const response = await axios.get(`${backendUrl}/api/merchant/${merchantAddress}/history`, { timeout: 10_000 });
    const invoices = Array.isArray(response.data?.invoices) ? response.data.invoices : [];
    return invoices.map((invoice: MerchantInvoice) => normalizeInvoice(invoice));
  } catch {
    return [];
  }
}

async function fetchBackendInvoiceById(id: string): Promise<MerchantInvoice | null> {
  const backendUrl = getBackendBaseUrl();
  if (!backendUrl) return null;

  try {
    const response = await axios.get(`${backendUrl}/api/invoices/${id}`, { timeout: 10_000 });
    if (!response.data?.invoice) return null;
    return normalizeInvoice(response.data.invoice as MerchantInvoice);
  } catch {
    return null;
  }
}


async function upsertBackendInvoice(invoice: MerchantInvoice): Promise<MerchantInvoice | null> {
  const backendUrl = getBackendBaseUrl();
  if (!backendUrl) return null;

  try {
    const response = await axios.post(`${backendUrl}/api/invoices`, normalizeInvoice(invoice), { timeout: 10_000 });
    if (!response.data?.invoice) return null;
    return normalizeInvoice(response.data.invoice as MerchantInvoice);
  } catch (error) {
    console.warn('[merchantService] backend invoice sync failed:', (error as any)?.message ?? error);
    return null;
  }
}

async function patchBackendInvoice(id: string, patch: Partial<MerchantInvoice>): Promise<MerchantInvoice | null> {
  const backendUrl = getBackendBaseUrl();
  if (!backendUrl) return null;

  try {
    const response = await axios.patch(`${backendUrl}/api/invoices/${id}`, patch, { timeout: 10_000 });
    if (!response.data?.invoice) return null;
    return normalizeInvoice(response.data.invoice as MerchantInvoice);
  } catch (error) {
    console.warn('[merchantService] backend invoice patch failed:', (error as any)?.message ?? error);
    return null;
  }
}

export function isMerchantBackendSyncEnabled() {
  return Boolean(getBackendBaseUrl());
}

export async function syncMerchantInvoiceToBackend(invoice: MerchantInvoice): Promise<MerchantInvoice> {
  const backendInvoice = await upsertBackendInvoice(invoice);
  if (!backendInvoice) return normalizeInvoice(invoice);
  const merged = normalizeInvoice({ ...invoice, ...backendInvoice });
  await saveOrReplaceInvoice(merged);
  return merged;
}
async function waitForBackendInvoice(id: string, attempts = 6, delayMs = 1_500) {
  for (let index = 0; index < attempts; index += 1) {
    const invoice = await fetchBackendInvoiceById(id);
    if (invoice) return invoice;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function resolveBlockTimestamp(blockNumber?: bigint) {
  if (!blockNumber) return undefined;

  try {
    const block = await getPublicClient().getBlock({ blockNumber });
    return Number(block.timestamp) * 1000;
  } catch {
    return undefined;
  }
}

export async function loadMerchantInvoices(options?: {
  merchantAddress?: string;
  preferBackend?: boolean;
}): Promise<MerchantInvoice[]> {
  const localInvoices = await readLocalInvoicesRaw();
  const shouldUseBackend = Boolean(options?.merchantAddress && (options?.preferBackend ?? true));

  if (!shouldUseBackend) {
    const normalized = mergeInvoices(localInvoices, []);
    await saveInvoices(normalized);
    return normalized;
  }

  const backendInvoices = await fetchBackendInvoicesByMerchant(options!.merchantAddress!);
  const merged = mergeInvoices(backendInvoices, localInvoices);
  await saveInvoices(merged);
  return merged;
}

export async function getMerchantInvoiceById(id: string): Promise<MerchantInvoice | null> {
  const backendInvoice = await fetchBackendInvoiceById(id);
  if (backendInvoice) {
    await saveOrReplaceInvoice(backendInvoice);
    return backendInvoice;
  }

  const invoices = await readLocalInvoicesRaw();
  return invoices.find((invoice) => invoice.id === id) ?? null;
}

export async function createMerchantInvoice(input: CreateMerchantInvoiceInput): Promise<MerchantInvoice> {
  assertRiskAllowed({
    operation: 'invoice_create',
    amount: input.amount,
    tokenSymbol: input.tokenSymbol,
    merchantAddress: input.merchantAddress,
    label: input.label,
  });

  const token = FX_TOKENS[input.tokenSymbol];
  if (!token.address) {
    throw new Error(`${input.tokenSymbol} is not configured yet on Arc.`);
  }

  const now = Date.now();
  const expiresAt = now + (input.expiresInMinutes ?? 30) * 60_000;
  const id = buildInvoiceId(input.merchantAddress, now);
  const amountRaw = parseUnits(input.amount, token.decimals);
  const contractInvoiceId = toInvoiceBytes32(id);

  const draftBase = {
    id,
    contractInvoiceId,
    merchantAddress: input.merchantAddress,
    tokenSymbol: input.tokenSymbol,
    settlementTokenSymbol: input.tokenSymbol,
    amount: input.amount,
    amountRaw: amountRaw.toString(),
    label: input.label,
    note: input.note,
    displayCurrency: input.displayCurrency ?? 'VND',
    displayAmount: input.displayAmount ?? input.amount,
    status: 'open' as const,
    settleMode: ARC_CONTRACTS.MERCHANT_SETTLEMENT && input.createOnchain ? 'contract' as const : 'transfer' as const,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  const paymentLink = buildPaymentLink(draftBase);
  const deepLink = buildDeepLink(draftBase);

  let invoice: MerchantInvoice = normalizeInvoice({
    ...draftBase,
    paymentLink,
    deepLink,
    qrValue: deepLink,
  });

  if (ARC_CONTRACTS.MERCHANT_SETTLEMENT && input.createOnchain) {
    const pk = await loadPrivateKey();
    if (!pk) {
      throw new Error('Wallet not found. Create or import a merchant wallet first.');
    }

    const publicClient = getPublicClient();
    const walletClient = createArcWalletClient(pk as Hex);
    const account = walletClient.account!;
    const invoiceReference = `${id}|${input.label}`;
    const metadataHash = keccak256(stringToHex(`${input.label}|${input.note ?? ''}|${draftBase.displayAmount}`));

    const txHash = await walletClient.writeContract({
      account,
      chain: null,
      address: ARC_CONTRACTS.MERCHANT_SETTLEMENT,
      abi: MERCHANT_SETTLEMENT_ABI,
      functionName: 'createInvoice',
      args: [
        contractInvoiceId,
        token.address as `0x${string}`,
        amountRaw,
        BigInt(Math.floor(expiresAt / 1000)),
        invoiceReference,
        draftBase.displayCurrency,
        metadataHash,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
    invoice = {
      ...invoice,
      txHash,
      blockTimestamp: await resolveBlockTimestamp(receipt.blockNumber),
      updatedAt: Date.now(),
    };
  }

  await saveOrReplaceInvoice(invoice);
  invoice = await syncMerchantInvoiceToBackend(invoice);

  safeNotify(notifyInvoiceCreated(invoice.id, invoice.label, `${invoice.amount} ${invoice.tokenSymbol}`));
  safeNotify(recordPassportEvent(invoice.merchantAddress, {
    id: `merchant_invoice_create_${invoice.id}`,
    type: 'merchant_invoice_create',
    points: 90,
    label: `Created ${invoice.label}`,
    metadata: { invoiceId: invoice.id, amount: invoice.amount, token: invoice.tokenSymbol },
  }));

  if (invoice.settleMode === 'contract') {
    const backendInvoice = await waitForBackendInvoice(invoice.id);
    if (backendInvoice) {
      await saveOrReplaceInvoice({ ...invoice, ...backendInvoice });
      return normalizeInvoice({ ...invoice, ...backendInvoice });
    }
  }

  return invoice;
}

export async function cancelMerchantInvoice(id: string): Promise<MerchantInvoice> {
  const invoice = await getMerchantInvoiceById(id);
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.status !== 'open') throw new Error('Only open invoices can be cancelled.');

  let txHash = invoice.txHash;
  if (invoice.settleMode === 'contract' && ARC_CONTRACTS.MERCHANT_SETTLEMENT) {
    const pk = await loadPrivateKey();
    if (!pk) throw new Error('Wallet not found.');

    const publicClient = getPublicClient();
    const walletClient = createArcWalletClient(pk as Hex);
    const account = walletClient.account!;

    txHash = await walletClient.writeContract({
      account,
      chain: null,
      address: ARC_CONTRACTS.MERCHANT_SETTLEMENT,
      abi: MERCHANT_SETTLEMENT_ABI,
      functionName: 'cancelInvoice',
      args: [invoice.contractInvoiceId],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
    const backendInvoice = await waitForBackendInvoice(id, 4, 1_000);
    const nextInvoice = normalizeInvoice({
      ...invoice,
      ...backendInvoice,
      txHash,
      status: backendInvoice?.status ?? 'cancelled',
      blockTimestamp: await resolveBlockTimestamp(receipt.blockNumber),
      updatedAt: Date.now(),
    });

    const syncedInvoice = await syncMerchantInvoiceToBackend(nextInvoice);
    return syncedInvoice;
  }

  const nextInvoice = normalizeInvoice({
    ...invoice,
    txHash,
    status: 'cancelled',
    updatedAt: Date.now(),
  });

  await saveOrReplaceInvoice(nextInvoice);
  return syncMerchantInvoiceToBackend(nextInvoice);
}

export async function payMerchantInvoice(
  input: string | PayMerchantInvoiceInput,
): Promise<MerchantPaymentResult> {
  const request = typeof input === 'string' ? { invoiceId: input } : input;
  const invoice = await getMerchantInvoiceById(request.invoiceId);
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.status !== 'open') throw new Error(`Invoice is already ${invoice.status}.`);
  if (invoice.expiresAt <= Date.now()) {
    const expiredInvoice = normalizeInvoice({ ...invoice, status: 'expired', updatedAt: Date.now() });
    await saveOrReplaceInvoice(expiredInvoice);
    throw new Error('Invoice expired. Please generate a new payment request.');
  }

  assertRiskAllowed({
    operation: 'invoice_pay',
    amount: invoice.amount,
    tokenSymbol: invoice.tokenSymbol,
    merchantAddress: invoice.merchantAddress,
    label: invoice.label,
  });
  const settlementToken = FX_TOKENS[invoice.tokenSymbol];
  if (!settlementToken.address) throw new Error(`${invoice.tokenSymbol} is not configured on Arc.`);

  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');

  const payerTokenSymbol = request.payerTokenSymbol ?? invoice.tokenSymbol;
  let fxQuote: FxQuote | undefined;
  let swapTxHash: string | undefined;

  if (payerTokenSymbol !== invoice.tokenSymbol) {
    fxQuote = await getFxQuote({
      fromSymbol: payerTokenSymbol,
      toSymbol: invoice.tokenSymbol,
      amount: invoice.amount,
      amountMode: 'EXACT_OUTPUT',
      localCurrency: invoice.displayCurrency,
      providerOverride: request.providerOverride,
    });


    const swapResult = await executeFxSwap({
      fromSymbol: payerTokenSymbol,
      toSymbol: invoice.tokenSymbol,
      amount: invoice.amount,
      amountMode: 'EXACT_OUTPUT',
      providerOverride: request.providerOverride,
      localCurrency: invoice.displayCurrency,
      quote: fxQuote,
    });

    swapTxHash = swapResult.txHash;
  }

  const publicClient = getPublicClient();
  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const amountRaw = BigInt(invoice.amountRaw);

  let txHash = '';
  let blockTimestamp: number | undefined;
  let mode: MerchantSettlementMode = invoice.settleMode;

  if (invoice.settleMode === 'contract' && ARC_CONTRACTS.MERCHANT_SETTLEMENT) {
    const allowance = (await publicClient.readContract({
      address: settlementToken.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, ARC_CONTRACTS.MERCHANT_SETTLEMENT],
    })) as bigint;

    if (allowance < amountRaw) {
      const approvalHash = await walletClient.writeContract({
        account,
        chain: null,
        address: settlementToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ARC_CONTRACTS.MERCHANT_SETTLEMENT, amountRaw],
      });

      await publicClient.waitForTransactionReceipt({ hash: approvalHash, confirmations: 1 });
    }

    txHash = await walletClient.writeContract({
      account,
      chain: null,
      address: ARC_CONTRACTS.MERCHANT_SETTLEMENT,
      abi: MERCHANT_SETTLEMENT_ABI,
      functionName: 'payInvoice',
      args: [invoice.contractInvoiceId],
    });
  } else if (settlementToken.address) {
    txHash = await walletClient.writeContract({
      account,
      chain: null,
      address: settlementToken.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [invoice.merchantAddress, amountRaw],
    });
    mode = 'transfer';
  } else {
    throw new Error('Live merchant payment route is not configured for this invoice token. Configure a settlement contract or a supported ERC-20 transfer route.');
  }

  if (mode !== 'local') {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
    blockTimestamp = await resolveBlockTimestamp(receipt.blockNumber);
  }

  const backendInvoice = mode === 'contract' ? await waitForBackendInvoice(invoice.id, 6, 1_500) : null;
  const paidInvoice: MerchantInvoice = normalizeInvoice({
    ...invoice,
    ...backendInvoice,
    status: 'paid',
    paidAt: backendInvoice?.paidAt ?? Date.now(),
    payerAddress: backendInvoice?.payerAddress ?? account.address,
    payerTokenSymbol,
    txHash,
    swapTxHash,
    settleMode: mode,
    blockTimestamp: backendInvoice?.blockTimestamp ?? blockTimestamp,
    fxRate: fxQuote?.rate,
    fxQuoteSource: fxQuote?.source,
    feeAmount: fxQuote ? fxQuote.fee.toFixed(6) : invoice.feeAmount,
    feeBps: fxQuote?.feeBps ?? invoice.feeBps,
    updatedAt: Date.now(),
  });

  await saveOrReplaceInvoice(paidInvoice);
  const syncedPaidInvoice = await syncMerchantInvoiceToBackend(paidInvoice);
  const paidIntentId = buildMerchantPaymentIntentId(syncedPaidInvoice.id, txHash);
  const paidIntent = await upsertPaymentIntent({
    id: paidIntentId,
    type: 'merchant',
    amount: syncedPaidInvoice.amount,
    tokenSymbol: syncedPaidInvoice.tokenSymbol,
    receiverWallet: syncedPaidInvoice.merchantAddress,
    senderWallet: syncedPaidInvoice.payerAddress,
    invoiceId: syncedPaidInvoice.id,
    txHash,
    status: 'confirmed',
    paidAt: syncedPaidInvoice.paidAt ?? Date.now(),
    label: syncedPaidInvoice.label,
    note: syncedPaidInvoice.note,
  });
  await recordActivity({
    id: paidIntentId,
    type: 'merchant_invoice',
    amount: syncedPaidInvoice.amount,
    token: syncedPaidInvoice.tokenSymbol,
    direction: 'outgoing',
    status: 'confirmed',
    timestamp: syncedPaidInvoice.paidAt ?? Date.now(),
    txHash,
    sourceFeature: 'merchant',
    counterparty: syncedPaidInvoice.merchantAddress,
    label: `Paid invoice: ${syncedPaidInvoice.label}`,
    note: syncedPaidInvoice.note,
    paymentIntentId: paidIntent?.id ?? paidIntentId,
    invoiceId: syncedPaidInvoice.id,
    metadata: { payerTokenSymbol, swapTxHash },
  });

  await patchBackendInvoice(syncedPaidInvoice.id, {
    status: syncedPaidInvoice.status,
    paidAt: syncedPaidInvoice.paidAt,
    payerAddress: syncedPaidInvoice.payerAddress,
    payerTokenSymbol: syncedPaidInvoice.payerTokenSymbol,
    txHash: syncedPaidInvoice.txHash,
    swapTxHash: syncedPaidInvoice.swapTxHash,
    blockTimestamp: syncedPaidInvoice.blockTimestamp,
    fxRate: syncedPaidInvoice.fxRate,
    fxQuoteSource: syncedPaidInvoice.fxQuoteSource,
    feeAmount: syncedPaidInvoice.feeAmount,
    feeBps: syncedPaidInvoice.feeBps,
  });

  safeNotify(notifyInvoicePaid(syncedPaidInvoice.id, txHash));
  safeNotify(recordPassportEvent(account.address, {
    id: `merchant_invoice_paid_${syncedPaidInvoice.id}_${txHash}`,
    type: 'merchant_invoice_paid',
    points: 140,
    label: `Paid ${syncedPaidInvoice.label}`,
    metadata: { invoiceId: syncedPaidInvoice.id, amount: syncedPaidInvoice.amount, token: syncedPaidInvoice.tokenSymbol },
  }));

  return {
    txHash,
    mode,
    invoice: syncedPaidInvoice,
    fxQuote,
  };
}

export function subscribeToMerchantInvoice(
  invoiceId: string,
  onUpdate: (invoice: MerchantInvoice | null) => void,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
) {
  let active = true;

  const run = async () => {
    if (!active) return;
    const invoice = await getMerchantInvoiceById(invoiceId);
    if (active) onUpdate(invoice);
  };

  run();
  const timer = setInterval(run, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export function subscribeToMerchantInvoices(
  merchantAddress: string,
  onUpdate: (invoices: MerchantInvoice[]) => void,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
) {
  let active = true;

  const run = async () => {
    if (!active) return;
    const invoices = await loadMerchantInvoices({ merchantAddress, preferBackend: true });
    if (active) onUpdate(invoices);
  };

  run();
  const timer = setInterval(run, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export function buildMerchantCsv(invoices: MerchantInvoice[]): string {
  const headers = [
    'invoice_id',
    'merchant_address',
    'settlement_token',
    'payer_token',
    'amount',
    'display_currency',
    'display_amount',
    'status',
    'settle_mode',
    'created_at',
    'updated_at',
    'paid_at',
    'block_timestamp',
    'payer_address',
    'tx_hash',
    'swap_tx_hash',
    'fx_rate',
    'fx_source',
    'fee_amount',
    'fee_bps',
    'label',
    'note',
  ];

  const rows = invoices.map((invoice) => [
    invoice.id,
    invoice.merchantAddress,
    invoice.tokenSymbol,
    invoice.payerTokenSymbol ?? '',
    invoice.amount,
    invoice.displayCurrency,
    invoice.displayAmount,
    invoice.status,
    invoice.settleMode,
    new Date(invoice.createdAt).toISOString(),
    new Date(invoice.updatedAt).toISOString(),
    invoice.paidAt ? new Date(invoice.paidAt).toISOString() : '',
    invoice.blockTimestamp ? new Date(invoice.blockTimestamp).toISOString() : '',
    invoice.payerAddress ?? '',
    invoice.txHash ?? '',
    invoice.swapTxHash ?? '',
    invoice.fxRate?.toString() ?? '',
    invoice.fxQuoteSource ?? '',
    invoice.feeAmount ?? '',
    invoice.feeBps?.toString() ?? '',
    `"${invoice.label.replace(/"/g, '""')}"`,
    `"${(invoice.note ?? '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function formatInvoiceTokenAmount(invoice: MerchantInvoice): string {
  const decimals = FX_TOKENS[invoice.tokenSymbol].decimals;
  return Number(formatUnits(BigInt(invoice.amountRaw), decimals)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}























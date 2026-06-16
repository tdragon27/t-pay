import { createPublicClient, formatUnits, http, keccak256, toHex } from 'viem';

const CONTRACT_ADDRESS = (process.env.MERCHANT_SETTLEMENT_ADDRESS ?? '') as `0x${string}` | '';
const ARC_RPC_URL = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network';
const START_BLOCK = BigInt(process.env.MERCHANT_SETTLEMENT_FROM_BLOCK ?? 0);

const publicClient = createPublicClient({
  transport: http(ARC_RPC_URL, { timeout: 8_000, retryCount: 1 }),
});

const INVOICE_CREATED_EVENT = {
  type: 'event',
  name: 'InvoiceCreated',
  inputs: [
    { indexed: true, name: 'invoiceId', type: 'bytes32' },
    { indexed: true, name: 'merchant', type: 'address' },
    { indexed: true, name: 'token', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'expiresAt', type: 'uint64' },
    { indexed: false, name: 'reference', type: 'string' },
    { indexed: false, name: 'currencyCode', type: 'string' },
    { indexed: false, name: 'metadataHash', type: 'bytes32' },
  ],
} as const;

const INVOICE_PAID_EVENT = {
  type: 'event',
  name: 'InvoicePaid',
  inputs: [
    { indexed: true, name: 'invoiceId', type: 'bytes32' },
    { indexed: true, name: 'merchant', type: 'address' },
    { indexed: true, name: 'payer', type: 'address' },
    { indexed: false, name: 'token', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ],
} as const;

const INVOICE_CANCELLED_EVENT = {
  type: 'event',
  name: 'InvoiceCancelled',
  inputs: [
    { indexed: true, name: 'invoiceId', type: 'bytes32' },
    { indexed: true, name: 'merchant', type: 'address' },
  ],
} as const;

const TOKEN_MAP = new Map<string, 'USDC' | 'USDT' | 'EURC'>([
  [String(process.env.ARC_USDC_ADDRESS ?? process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000').toLowerCase(), 'USDC'],
  [String(process.env.ARC_USDT_ADDRESS ?? process.env.NEXT_PUBLIC_ARC_USDT_ADDRESS ?? '').toLowerCase(), 'USDT'],
  [String(process.env.ARC_EURC_ADDRESS ?? process.env.NEXT_PUBLIC_ARC_EURC_ADDRESS ?? '').toLowerCase(), 'EURC'],
]);

type MerchantInvoiceStatus = 'open' | 'paid' | 'cancelled' | 'expired';

export interface IndexedInvoice {
  id: string;
  contractInvoiceId: `0x${string}`;
  merchantAddress: `0x${string}`;
  tokenSymbol: 'USDC' | 'USDT' | 'EURC';
  settlementTokenSymbol: 'USDC' | 'USDT' | 'EURC';
  amount: string;
  amountRaw: string;
  label: string;
  note?: string;
  displayCurrency: 'USD' | 'VND';
  displayAmount: string;
  status: MerchantInvoiceStatus;
  settleMode: 'contract';
  paymentLink: string;
  deepLink: string;
  qrValue: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  paidAt?: number;
  payerAddress?: `0x${string}`;
  payerTokenSymbol?: 'USDC' | 'USDT' | 'EURC';
  txHash?: string;
  swapTxHash?: string;
  blockTimestamp?: number;
  fxRate?: number;
  fxQuoteSource?: 'DEX' | 'STABLEFX';
  feeAmount?: string;
  feeBps?: number;
}

const state: {
  initialized: boolean;
  lastScannedBlock: bigint;
  invoices: Map<string, IndexedInvoice>;
  blockTimestamps: Map<string, number>;
  syncPromise: Promise<void> | null;
} = {
  initialized: false,
  lastScannedBlock: START_BLOCK > 0n ? START_BLOCK - 1n : 0n,
  invoices: new Map(),
  blockTimestamps: new Map(),
  syncPromise: null,
};

function parseReference(reference: string, contractInvoiceId: `0x${string}`) {
  if (reference.includes('|')) {
    const separator = reference.indexOf('|');
    return {
      id: reference.slice(0, separator),
      label: reference.slice(separator + 1) || 'Arc Invoice',
    };
  }

  return {
    id: contractInvoiceId,
    label: reference || 'Arc Invoice',
  };
}

function buildDeepLink(id: string, merchantAddress: string, amount: string, tokenSymbol: string, label: string) {
  const params = [
    ['invoiceId', id],
    ['merchant', merchantAddress],
    ['amount', amount],
    ['token', tokenSymbol],
    ['label', label],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `tpay://pay?${params}`;
}

function tokenSymbolForAddress(address: string) {
  return TOKEN_MAP.get(address.toLowerCase()) ?? 'USDC';
}

async function getBlockTimestamp(blockNumber: bigint) {
  const cacheKey = blockNumber.toString();
  const cached = state.blockTimestamps.get(cacheKey);
  if (cached) return cached;

  const block = await publicClient.getBlock({ blockNumber });
  const timestamp = Number(block.timestamp) * 1000;
  state.blockTimestamps.set(cacheKey, timestamp);
  return timestamp;
}

async function applyCreatedLogs(fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: CONTRACT_ADDRESS,
    event: INVOICE_CREATED_EVENT,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const contractInvoiceId = String(log.args.invoiceId) as `0x${string}`;
    const tokenAddress = String(log.args.token);
    const tokenSymbol = tokenSymbolForAddress(tokenAddress);
    const amountRaw = BigInt(log.args.amount ?? 0n);
    const amount = Number(formatUnits(amountRaw, 6)).toFixed(2);
    const createdAt = log.blockNumber ? await getBlockTimestamp(log.blockNumber) : Date.now();
    const expiresAt = Number(log.args.expiresAt ?? 0n) * 1000;
    const { id, label } = parseReference(String(log.args.reference ?? ''), contractInvoiceId);
    const displayCurrency = String(log.args.currencyCode ?? 'USD').toUpperCase() === 'VND' ? 'VND' : 'USD';
    const deepLink = buildDeepLink(id, String(log.args.merchant), amount, tokenSymbol, label);

    state.invoices.set(contractInvoiceId.toLowerCase(), {
      id,
      contractInvoiceId,
      merchantAddress: String(log.args.merchant) as `0x${string}`,
      tokenSymbol,
      settlementTokenSymbol: tokenSymbol,
      amount,
      amountRaw: amountRaw.toString(),
      label,
      note: undefined,
      displayCurrency,
      displayAmount: amount,
      status: expiresAt <= Date.now() ? 'expired' : 'open',
      settleMode: 'contract',
      paymentLink: deepLink,
      deepLink,
      qrValue: deepLink,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      txHash: log.transactionHash,
      blockTimestamp: createdAt,
    });
  }
}

async function applyPaidLogs(fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: CONTRACT_ADDRESS,
    event: INVOICE_PAID_EVENT,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const contractInvoiceId = String(log.args.invoiceId).toLowerCase();
    const invoice = state.invoices.get(contractInvoiceId);
    if (!invoice) continue;

    const paidAt = log.blockNumber ? await getBlockTimestamp(log.blockNumber) : Date.now();
    const tokenSymbol = tokenSymbolForAddress(String(log.args.token));

    state.invoices.set(contractInvoiceId, {
      ...invoice,
      status: 'paid',
      paidAt,
      updatedAt: paidAt,
      payerAddress: String(log.args.payer) as `0x${string}`,
      payerTokenSymbol: tokenSymbol,
      txHash: log.transactionHash,
      blockTimestamp: paidAt,
    });
  }
}

async function applyCancelledLogs(fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: CONTRACT_ADDRESS,
    event: INVOICE_CANCELLED_EVENT,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const contractInvoiceId = String(log.args.invoiceId).toLowerCase();
    const invoice = state.invoices.get(contractInvoiceId);
    if (!invoice) continue;

    const updatedAt = log.blockNumber ? await getBlockTimestamp(log.blockNumber) : Date.now();
    state.invoices.set(contractInvoiceId, {
      ...invoice,
      status: 'cancelled',
      updatedAt,
      txHash: log.transactionHash,
      blockTimestamp: updatedAt,
    });
  }
}

export async function syncMerchantIndexer() {
  if (!CONTRACT_ADDRESS) return;
  if (state.syncPromise) return state.syncPromise;

  state.syncPromise = (async () => {
    const latestBlock = await publicClient.getBlockNumber();
    const startBlock = state.initialized ? state.lastScannedBlock + 1n : START_BLOCK;

    if (startBlock > latestBlock) {
      state.initialized = true;
      return;
    }

    for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += 2_000n) {
      const toBlock = fromBlock + 1_999n > latestBlock ? latestBlock : fromBlock + 1_999n;
      await applyCreatedLogs(fromBlock, toBlock);
      await applyPaidLogs(fromBlock, toBlock);
      await applyCancelledLogs(fromBlock, toBlock);
    }

    state.lastScannedBlock = latestBlock;
    state.initialized = true;
  })().finally(() => {
    state.syncPromise = null;
  });

  return state.syncPromise;
}

export async function listIndexedInvoices() {
  await syncMerchantIndexer();
  return Array.from(state.invoices.values())
    .map((invoice) => ({
      ...invoice,
      status: invoice.status === 'open' && invoice.expiresAt <= Date.now() ? 'expired' : invoice.status,
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function getIndexedInvoice(id: string) {
  await syncMerchantIndexer();

  const directMatch = Array.from(state.invoices.values()).find((invoice) => invoice.id === id || invoice.contractInvoiceId.toLowerCase() === id.toLowerCase());
  if (directMatch) {
    return directMatch.status === 'open' && directMatch.expiresAt <= Date.now()
      ? { ...directMatch, status: 'expired' as const }
      : directMatch;
  }

  const hashedId = keccak256(toHex(id)).toLowerCase();
  const hashedMatch = state.invoices.get(hashedId);
  if (!hashedMatch) return null;

  return hashedMatch.status === 'open' && hashedMatch.expiresAt <= Date.now()
    ? { ...hashedMatch, status: 'expired' as const }
    : hashedMatch;
}

export async function getMerchantHistory(merchantAddress: string) {
  const invoices = await listIndexedInvoices();
  return invoices.filter((invoice) => invoice.merchantAddress.toLowerCase() === merchantAddress.toLowerCase());
}


import { z } from 'zod';
import { type IndexedInvoice, getIndexedInvoice, getMerchantHistory, listIndexedInvoices } from './merchantIndexer';

const invoiceStatusSchema = z.enum(['open', 'paid', 'cancelled', 'expired']);
const tokenSchema = z.enum(['USDC', 'USDT', 'EURC']);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);

export const syncedInvoiceSchema = z.object({
  id: z.string().min(1),
  contractInvoiceId: hexSchema,
  merchantAddress: addressSchema,
  tokenSymbol: tokenSchema,
  settlementTokenSymbol: tokenSchema.default('USDC'),
  amount: z.string().min(1),
  amountRaw: z.string().min(1),
  label: z.string().min(1),
  note: z.string().optional(),
  displayCurrency: z.enum(['USD', 'VND']),
  displayAmount: z.string().min(1),
  status: invoiceStatusSchema,
  settleMode: z.enum(['contract', 'transfer', 'local']),
  paymentLink: z.string().min(1),
  deepLink: z.string().min(1),
  qrValue: z.string().min(1),
  createdAt: z.coerce.number(),
  updatedAt: z.coerce.number(),
  expiresAt: z.coerce.number(),
  paidAt: z.coerce.number().optional(),
  payerAddress: addressSchema.optional(),
  payerTokenSymbol: tokenSchema.optional(),
  txHash: z.string().optional(),
  swapTxHash: z.string().optional(),
  blockTimestamp: z.coerce.number().optional(),
  fxRate: z.coerce.number().optional(),
  fxQuoteSource: z.enum(['DEX', 'STABLEFX']).optional(),
  feeAmount: z.string().optional(),
  feeBps: z.coerce.number().optional(),
});

export const invoicePatchSchema = syncedInvoiceSchema.partial().extend({ id: z.string().min(1) });

export type SyncedInvoice = z.infer<typeof syncedInvoiceSchema>;

type AnyInvoice = SyncedInvoice | IndexedInvoice;

const globalStore = globalThis as typeof globalThis & {
  __tpayInvoiceMetadata?: Map<string, SyncedInvoice>;
};

const metadataStore = globalStore.__tpayInvoiceMetadata ?? new Map<string, SyncedInvoice>();
globalStore.__tpayInvoiceMetadata = metadataStore;

function normalizeStatus(invoice: AnyInvoice) {
  if (invoice.status === 'open' && invoice.expiresAt <= Date.now()) return 'expired' as const;
  return invoice.status;
}

function withNormalizedStatus<T extends AnyInvoice>(invoice: T): T {
  return { ...invoice, status: normalizeStatus(invoice), updatedAt: Math.max(invoice.updatedAt ?? 0, invoice.createdAt ?? 0) } as T;
}

function indexKeys(invoice: AnyInvoice) {
  return [invoice.id, invoice.contractInvoiceId.toLowerCase()].filter(Boolean);
}

function mergeInvoice(metadata: SyncedInvoice | undefined, indexed: IndexedInvoice | undefined): AnyInvoice | null {
  if (!metadata && !indexed) return null;
  if (!indexed) return withNormalizedStatus(metadata!);
  if (!metadata) return withNormalizedStatus(indexed);

  return withNormalizedStatus({
    ...metadata,
    ...indexed,
    label: metadata.label || indexed.label,
    note: metadata.note,
    displayCurrency: metadata.displayCurrency ?? indexed.displayCurrency,
    displayAmount: metadata.displayAmount ?? indexed.displayAmount,
    paymentLink: metadata.paymentLink ?? indexed.paymentLink,
    deepLink: metadata.deepLink ?? indexed.deepLink,
    qrValue: metadata.qrValue ?? indexed.qrValue,
    payerTokenSymbol: metadata.payerTokenSymbol ?? indexed.payerTokenSymbol,
    swapTxHash: metadata.swapTxHash ?? indexed.swapTxHash,
    fxRate: metadata.fxRate ?? indexed.fxRate,
    fxQuoteSource: metadata.fxQuoteSource ?? indexed.fxQuoteSource,
    feeAmount: metadata.feeAmount ?? indexed.feeAmount,
    feeBps: metadata.feeBps ?? indexed.feeBps,
    updatedAt: Math.max(metadata.updatedAt, indexed.updatedAt),
  });
}

export function upsertInvoiceMetadata(invoice: SyncedInvoice) {
  const normalized = withNormalizedStatus({
    ...invoice,
    updatedAt: invoice.updatedAt || Date.now(),
  });
  metadataStore.set(normalized.id, normalized);
  metadataStore.set(normalized.contractInvoiceId.toLowerCase(), normalized);
  return normalized;
}

export function patchInvoiceMetadata(id: string, patch: Partial<SyncedInvoice>) {
  const current = metadataStore.get(id) ?? metadataStore.get(id.toLowerCase());
  if (!current) return null;

  return upsertInvoiceMetadata({
    ...current,
    ...patch,
    id: current.id,
    contractInvoiceId: current.contractInvoiceId,
    updatedAt: Date.now(),
  });
}

export async function listSyncedInvoices() {
  const indexed = await listIndexedInvoices();
  const seen = new Map<string, AnyInvoice>();

  for (const invoice of Array.from(metadataStore.values())) {
    seen.set(invoice.id, withNormalizedStatus(invoice));
  }

  for (const invoice of indexed) {
    const metadata = metadataStore.get(invoice.id) ?? metadataStore.get(invoice.contractInvoiceId.toLowerCase());
    const merged = mergeInvoice(metadata, invoice);
    if (!merged) continue;
    for (const key of indexKeys(merged)) seen.set(key, merged);
    seen.set(merged.id, merged);
  }

  const byId = new Map<string, AnyInvoice>();
  for (const invoice of seen.values()) byId.set(invoice.id, invoice);
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSyncedInvoice(id: string) {
  const metadata = metadataStore.get(id) ?? metadataStore.get(id.toLowerCase());
  const indexed = await getIndexedInvoice(id);
  return mergeInvoice(metadata, indexed ?? undefined);
}

export async function getSyncedMerchantHistory(merchantAddress: string) {
  const indexed = await getMerchantHistory(merchantAddress);
  const local = Array.from(metadataStore.values()).filter(
    (invoice, index, all) =>
      invoice.id === all.find((candidate) => candidate.id === invoice.id)?.id &&
      invoice.merchantAddress.toLowerCase() === merchantAddress.toLowerCase(),
  );

  const map = new Map<string, AnyInvoice>();
  for (const invoice of local) map.set(invoice.id, withNormalizedStatus(invoice));
  for (const invoice of indexed) {
    const metadata = metadataStore.get(invoice.id) ?? metadataStore.get(invoice.contractInvoiceId.toLowerCase());
    const merged = mergeInvoice(metadata, invoice);
    if (merged) map.set(merged.id, merged);
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

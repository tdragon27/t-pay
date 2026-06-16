import Constants from 'expo-constants';

function normalizeAddress(value?: string): `0x${string}` | '' {
  if (!value || typeof value !== 'string') return '';
  return value.startsWith('0x') ? (value as `0x${string}`) : '';
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const CONTRACT_ADDRESSES = {
  RECURRING_PAYMENTS: normalizeAddress(
    extra.recurringPaymentsAddress ?? process.env.EXPO_PUBLIC_RECURRING_ADDRESS,
  ),
  INVOICE_MANAGER: normalizeAddress(
    extra.invoiceManagerAddress ?? process.env.EXPO_PUBLIC_INVOICE_ADDRESS,
  ),
  PASSPORT_ANCHOR: normalizeAddress(
    extra.passportAnchorAddress ?? process.env.EXPO_PUBLIC_PASSPORT_ANCHOR_ADDRESS,
  ),
} as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const USDC_DECIMALS = 6;

export function isRecurringConfigured() {
  return Boolean(CONTRACT_ADDRESSES.RECURRING_PAYMENTS);
}

export function isInvoiceConfigured() {
  return Boolean(CONTRACT_ADDRESSES.INVOICE_MANAGER);
}

export function isPassportAnchorConfigured() {
  return Boolean(CONTRACT_ADDRESSES.PASSPORT_ANCHOR);
}

export const PASSPORT_ANCHOR_ABI = [
  {
    name: 'anchorAchievement',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'level', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    name: 'clearMyAnchor',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'getAnchor',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'level', type: 'uint32' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const;
export const RECURRING_ABI = [
  {
    name: 'createSubscription',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interval', type: 'uint256' },
      { name: 'startAt', type: 'uint256' },
      { name: 'endAt', type: 'uint256' },
      { name: 'label', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'cancelSubscription',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'pauseSubscription',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'resumeSubscription',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'executePayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getSubscription',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'payer', type: 'address' },
          { name: 'payee', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'interval', type: 'uint256' },
          { name: 'nextPaymentAt', type: 'uint256' },
          { name: 'endAt', type: 'uint256' },
          { name: 'totalPaid', type: 'uint256' },
          { name: 'paymentsCount', type: 'uint256' },
          { name: 'active', type: 'bool' },
          { name: 'label', type: 'string' },
        ],
      },
    ],
  },
  {
    name: 'getPayerSubscriptions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'payer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'isDue',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'subId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const INVOICE_ABI = [
  {
    name: 'createInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'amountUsdc', type: 'uint256' },
      { name: 'dueAt', type: 'uint256' },
      { name: 'invoiceNumber', type: 'string' },
      { name: 'metadataCid', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'payInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancelInvoice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'sendReminder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getInvoice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'payer', type: 'address' },
          { name: 'amountUsdc', type: 'uint256' },
          { name: 'dueAt', type: 'uint256' },
          { name: 'paidAt', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'metadataCid', type: 'string' },
          { name: 'invoiceNumber', type: 'string' },
        ],
      },
    ],
  },
  {
    name: 'getCreatorInvoices',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'lastReminderAt',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const INTERVAL_PRESETS = [
  { label: 'Daily', seconds: 86_400 },
  { label: 'Weekly', seconds: 7 * 86_400 },
  { label: 'Biweekly', seconds: 14 * 86_400 },
  { label: 'Monthly', seconds: 30 * 86_400 },
  { label: 'Yearly', seconds: 365 * 86_400 },
] as const;

export const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Overdue'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];



export type PaymentIntentStatus =
  | 'draft'
  | 'awaiting_user_confirmation'
  | 'submitting'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'unknown';

export type PaymentIntentEvent =
  | 'request_user_confirmation'
  | 'submit'
  | 'submitted'
  | 'confirm'
  | 'fail'
  | 'expire'
  | 'cancel'
  | 'mark_unknown';

export type SplitLifecycleStatus = 'open' | 'partial' | 'complete' | 'expired' | 'cancelled';

export const PAYMENT_INTENT_TERMINAL_STATUSES: ReadonlySet<PaymentIntentStatus> = new Set([
  'confirmed',
  'failed',
  'expired',
  'cancelled',
]);

const PAYMENT_INTENT_STATUSES: ReadonlySet<PaymentIntentStatus> = new Set([
  'draft',
  'awaiting_user_confirmation',
  'submitting',
  'submitted',
  'pending',
  'confirmed',
  'failed',
  'expired',
  'cancelled',
  'unknown',
]);

const LEGAL_PAYMENT_INTENT_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  draft: ['awaiting_user_confirmation', 'submitting', 'pending', 'failed', 'expired', 'cancelled', 'unknown'],
  awaiting_user_confirmation: ['submitting', 'failed', 'expired', 'cancelled', 'unknown'],
  submitting: ['submitted', 'pending', 'failed', 'unknown'],
  submitted: ['pending', 'confirmed', 'failed', 'expired', 'unknown'],
  pending: ['confirmed', 'failed', 'expired', 'unknown'],
  confirmed: ['confirmed'],
  failed: ['failed'],
  expired: ['expired'],
  cancelled: ['cancelled'],
  unknown: ['pending', 'confirmed', 'failed', 'expired', 'cancelled'],
};

const EVENT_TO_STATUS: Record<PaymentIntentEvent, PaymentIntentStatus> = {
  request_user_confirmation: 'awaiting_user_confirmation',
  submit: 'submitting',
  submitted: 'submitted',
  confirm: 'confirmed',
  fail: 'failed',
  expire: 'expired',
  cancel: 'cancelled',
  mark_unknown: 'unknown',
};

export function normalizePaymentIntentStatus(value?: string | null): PaymentIntentStatus {
  if (value && PAYMENT_INTENT_STATUSES.has(value as PaymentIntentStatus)) {
    return value as PaymentIntentStatus;
  }
  if (value === 'success' || value === 'paid') return 'confirmed';
  if (value === 'processing' || value === 'broadcasting') return 'pending';
  return 'draft';
}

export function canSetPaymentIntentStatus(current: PaymentIntentStatus, next: PaymentIntentStatus) {
  const normalizedCurrent = normalizePaymentIntentStatus(current);
  const normalizedNext = normalizePaymentIntentStatus(next);
  return LEGAL_PAYMENT_INTENT_TRANSITIONS[normalizedCurrent].includes(normalizedNext);
}

export function getPaymentIntentTransition(
  current: PaymentIntentStatus,
  event: PaymentIntentEvent,
): PaymentIntentStatus {
  const next = EVENT_TO_STATUS[event];
  if (!canSetPaymentIntentStatus(current, next)) {
    throw new Error(`Illegal payment intent transition: ${current} -> ${next}`);
  }
  return next;
}

export function applyPaymentIntentTransition(
  current: PaymentIntentStatus,
  event: PaymentIntentEvent,
): PaymentIntentStatus {
  return getPaymentIntentTransition(current, event);
}

export function activityDedupeKey(id: string, txHash?: string | null) {
  return txHash ? `tx:${txHash.toLowerCase()}` : `id:${id}`;
}

export type WalletTaskType = 'send' | 'bridge' | 'faucet';

export function canAutoExecuteWalletTask(type: WalletTaskType) {
  return type === 'faucet';
}

export function normalizePaymentAmount(amount: string | number) {
  let raw = String(amount).trim().replace(/\s/g, '');
  if (raw.includes('.') && raw.includes(',')) raw = raw.replace(/,/g, '');
  else if ((raw.match(/,/g) ?? []).length === 1) raw = raw.replace(',', '.');
  else if (raw.includes(',')) return '0';

  if (!/^\d+(?:\.\d+)?$/.test(raw)) return '0';
  const [wholePart, fractionPart = ''] = raw.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionPart.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function statusRank(status?: string) {
  if (status === 'confirmed' || status === 'success' || status === 'paid') return 6;
  if (status === 'pending') return 5;
  if (status === 'submitted') return 4;
  if (status === 'submitting') return 3;
  if (status === 'awaiting_user_confirmation') return 2;
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 1;
  return 0;
}

export function dedupeByActivityKey<T extends { id: string; txHash?: string | null; timestamp: number; status?: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = activityDedupeKey(row.id, row.txHash);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, row);
      continue;
    }

    const rank = statusRank(row.status);
    const previousRank = statusRank(previous.status);
    if (rank > previousRank || (rank === previousRank && row.timestamp >= previous.timestamp)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function amountNumber(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatUsdc(value: string | number) {
  return amountNumber(value).toFixed(2);
}

export function calculateSplitProgress(input: {
  totalUsdc: string | number;
  receivedUsdc?: string | number | null;
  completeByTotal: boolean;
  participants: Array<{ paid: boolean; amountUsdc: string | number; amountPaid?: string | number | null }>;
}) {
  const paid = input.participants.filter((participant) => participant.paid).length;
  const participantReceived = input.participants
    .filter((participant) => participant.paid)
    .reduce((sum, participant) => sum + amountNumber(participant.amountPaid ?? participant.amountUsdc), 0);
  const received = input.completeByTotal ? amountNumber(input.receivedUsdc ?? 0) : participantReceived;
  const totalAmount = amountNumber(input.totalUsdc);

  return {
    paid,
    total: input.participants.length,
    receivedUsdc: formatUsdc(received),
    totalUsdc: formatUsdc(totalAmount),
    percent: totalAmount > 0 ? Math.min(100, Math.round((received / totalAmount) * 100)) : 0,
    complete: input.completeByTotal ? received + 0.000001 >= totalAmount : paid === input.participants.length,
  };
}

export function splitPaymentGuard(input: {
  lifecycleStatus: SplitLifecycleStatus;
  completeByTotal: boolean;
  participantId?: string | null;
  participantPaid?: boolean;
  sameParticipantTx?: boolean;
}) {
  if (input.lifecycleStatus !== 'open' && input.lifecycleStatus !== 'partial') {
    return { allowed: false, duplicate: false, reason: `Split bill is ${input.lifecycleStatus} and cannot accept payments.` };
  }

  if (!input.completeByTotal && !input.participantId) {
    return { allowed: false, duplicate: false, reason: 'Participant id is required for participant-based split payments.' };
  }

  if (input.participantPaid && input.sameParticipantTx) {
    return { allowed: false, duplicate: true, reason: 'Duplicate split payment already recorded.' };
  }

  if (input.participantPaid) {
    return { allowed: false, duplicate: false, reason: 'Participant has already paid this split.' };
  }

  return { allowed: true, duplicate: false };
}

export function buildMerchantPaymentIntentId(invoiceId: string, txHash: string) {
  return `merchant_payment_${invoiceId}_${txHash.toLowerCase()}`;
}

export function resolveBalanceFallback(input: {
  source: string;
  liveTotalUsdc: number;
  cachedTotalUsdc?: string | number | null;
}) {
  const cached = amountNumber(input.cachedTotalUsdc);
  const usingCache = input.source === 'UNAVAILABLE' && cached > 0;
  return {
    usingCache,
    totalUsdc: usingCache ? cached : input.liveTotalUsdc,
  };
}

const SAFE_OPEN_SCHEMES = new Set(['http:', 'https:', 'tpay:', 'exp:']);

export function isSafeOpenUrl(url?: string | null) {
  const nextUrl = url?.trim();
  if (!nextUrl || nextUrl.length > 4096) return false;

  try {
    const parsed = new URL(nextUrl);
    return SAFE_OPEN_SCHEMES.has(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}

export function redactUrlForLog(url?: string | null) {
  const nextUrl = url?.trim();
  if (!nextUrl) return '<empty-url>';

  try {
    const parsed = new URL(nextUrl);
    const path = parsed.pathname ? `${parsed.pathname.slice(0, 48)}${parsed.pathname.length > 48 ? '...' : ''}` : '';
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search ? '?<redacted>' : ''}`;
  } catch {
    return '<invalid-url>';
  }
}

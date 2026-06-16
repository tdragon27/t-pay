export type PaymentIntentStatus = 'draft' | 'pending' | 'confirmed' | 'failed' | 'cancelled';
export type PaymentIntentEvent = 'submit' | 'confirm' | 'fail' | 'cancel';
export type SplitLifecycleStatus = 'open' | 'partial' | 'complete' | 'expired' | 'cancelled';

export function applyPaymentIntentTransition(
  current: PaymentIntentStatus,
  event: PaymentIntentEvent,
): PaymentIntentStatus {
  if (current === 'confirmed' || current === 'failed' || current === 'cancelled') return current;
  if (event === 'submit') return 'pending';
  if (event === 'confirm') return 'confirmed';
  if (event === 'fail') return 'failed';
  return 'cancelled';
}

export function activityDedupeKey(id: string, txHash?: string | null) {
  return txHash ? `tx:${txHash.toLowerCase()}` : `id:${id}`;
}

function statusRank(status?: string) {
  if (status === 'confirmed' || status === 'success' || status === 'paid') return 4;
  if (status === 'pending') return 3;
  if (status === 'failed') return 2;
  if (status === 'cancelled') return 1;
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSmartQrLink } from '@/services/paymentRequestService';
import { getSupabaseClient, requireSupabaseClient } from '@/services/supabaseClient';
import { recordActivity } from '@/services/activityService';
import { recordNotification } from '@/services/notificationService';
import { upsertPaymentIntent } from '@/services/paymentIntentService';
import { calculateSplitProgress, splitPaymentGuard, type SplitLifecycleStatus } from '@/utils/tpayLogic';

export type SplitBillStatus = 'open' | 'complete' | 'expired' | 'cancelled';
export type SplitTrackingMode = 'per_person' | 'total_received';
export type SplitExpiryPreset = '24h' | '48h' | '7d' | 'none';

export interface SplitParticipant {
  id: string;
  name: string;
  address?: `0x${string}`;
  amountUsdc: string;
  paid: boolean;
  paidAt?: number;
  paidTxHash?: string;
  payerWallet?: `0x${string}`;
  amountPaid?: string;
  overpaid?: boolean;
  underpaid?: boolean;
}

export interface SplitBill {
  id: string;
  creatorAddress: `0x${string}`;
  receiverWallet: `0x${string}`;
  totalUsdc: string;
  peopleCount: number;
  autoDivide: boolean;
  completeByTotal: boolean;
  note?: string;
  expiresAt?: number;
  status: SplitBillStatus;
  trackingMode: SplitTrackingMode;
  receivedUsdc: string;
  participants: SplitParticipant[];
  createdAt: number;
  updatedAt: number;
}

type SplitBillRow = {
  id: string;
  note: string | null;
  total_usdc: string | number;
  people_count: number;
  auto_divide: boolean;
  complete_by_total: boolean;
  status: SplitBillStatus;
  created_at: string;
  updated_at?: string | null;
  expires_at: string | null;
  receiver_wallet: string;
  received_usdc: string | number | null;
};

type ParticipantRow = {
  id: string;
  split_bill_id: string;
  name: string;
  wallet: string | null;
  amount_usdc: string | number;
  paid: boolean;
  paid_at: string | null;
  tx_hash?: string | null;
  payer_wallet?: string | null;
  amount_paid_usdc?: string | number | null;
};


const LOCAL_SPLIT_BILLS_KEY = 'tpay:split_bills:local';

function makeLocalId(prefix: string) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function isLocalSplitId(id?: string) {
  return Boolean(id && id.startsWith('local_split_'));
}

async function readLocalSplitBills(): Promise<SplitBill[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_SPLIT_BILLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalSplitBills(splits: SplitBill[]) {
  await AsyncStorage.setItem(LOCAL_SPLIT_BILLS_KEY, JSON.stringify(splits));
}

function withExpiredStatus(split: SplitBill): SplitBill {
  return isExpired(split) ? { ...split, status: 'expired', updatedAt: Date.now() } : split;
}

async function loadLocalSplitBills(): Promise<SplitBill[]> {
  const stored = await readLocalSplitBills();
  const normalized = stored.map(withExpiredStatus).sort((a, b) => b.createdAt - a.createdAt);
  if (JSON.stringify(stored) !== JSON.stringify(normalized)) await writeLocalSplitBills(normalized);
  return normalized;
}

async function saveLocalSplitBill(split: SplitBill) {
  const existing = await readLocalSplitBills();
  const next = [split, ...existing.filter((item) => item.id !== split.id)].sort((a, b) => b.createdAt - a.createdAt);
  await writeLocalSplitBills(next);
  return split;
}

async function getLocalSplitBillById(id: string): Promise<SplitBill | null> {
  const bills = await loadLocalSplitBills();
  return bills.find((item) => item.id === id) ?? null;
}

async function patchLocalSplitBill(id: string, updater: (split: SplitBill) => SplitBill): Promise<SplitBill | null> {
  const bills = await readLocalSplitBills();
  let updated: SplitBill | null = null;
  const next = bills.map((split) => {
    if (split.id !== id) return split;
    updated = updater(withExpiredStatus(split));
    return updated;
  });
  if (updated) await writeLocalSplitBills(next.sort((a, b) => b.createdAt - a.createdAt));
  return updated;
}

function makeLocalSplitBill(input: {
  creatorAddress?: string;
  receiverWallet?: string;
  totalUsdc: string;
  peopleCount?: number;
  autoDivide?: boolean;
  completeByTotal?: boolean;
  note?: string;
  expiresAt?: number;
  participants: Array<{ name: string; address?: string; amountUsdc: string }>;
}, receiverWallet: `0x${string}`, total: number): SplitBill {
  const now = Date.now();
  const participants = input.participants.map((participant) => {
    const amount = amountNumber(participant.amountUsdc);
    if (!participant.name.trim()) throw new Error('Participant name is required.');
    if (amount <= 0) throw new Error('Participant amount must be greater than 0.');
    return {
      id: makeLocalId('local_part'),
      name: participant.name.trim(),
      address: optionalAddress(participant.address),
      amountUsdc: amount.toFixed(2),
      paid: false,
    } satisfies SplitParticipant;
  });

  return {
    id: makeLocalId('local_split'),
    creatorAddress: optionalAddress(input.creatorAddress) ?? receiverWallet,
    receiverWallet,
    totalUsdc: total.toFixed(2),
    peopleCount: input.peopleCount ?? participants.length,
    autoDivide: input.autoDivide ?? true,
    completeByTotal: input.completeByTotal ?? true,
    note: input.note?.trim() || undefined,
    expiresAt: input.expiresAt,
    status: 'open',
    trackingMode: (input.completeByTotal ?? true) ? 'total_received' : 'per_person',
    receivedUsdc: '0.00',
    participants,
    createdAt: now,
    updatedAt: now,
  };
}

async function recordSplitCreatedActivity(created: SplitBill) {
  await recordActivity({
    id: `split_create_${created.id}`,
    type: 'request',
    amount: created.totalUsdc,
    token: 'USDC',
    direction: 'incoming',
    status: 'pending',
    timestamp: created.createdAt,
    sourceFeature: 'split',
    counterparty: created.receiverWallet,
    label: `Split bill: ${created.note ?? created.id}`,
    note: created.note,
    splitId: created.id,
  });
}


function finalizeLocalSplit(split: SplitBill): SplitBill {
  const received = split.completeByTotal
    ? amountNumber(split.receivedUsdc)
    : split.participants.reduce((sum, participant) => sum + (participant.paid ? amountNumber(participant.amountPaid ?? participant.amountUsdc) : 0), 0);
  const allPaid = split.participants.length > 0 && split.participants.every((participant) => participant.paid);
  const complete = split.completeByTotal ? received >= amountNumber(split.totalUsdc) : allPaid;
  return {
    ...split,
    status: complete ? 'complete' : split.status === 'complete' ? 'open' : split.status,
    receivedUsdc: formatUsdc(received),
    updatedAt: Date.now(),
  };
}

async function setLocalParticipantPaid(input: {
  splitId: string;
  participantId: string;
  paid: boolean;
  txHash?: string;
  amountUsdc?: string | number | null;
  payerWallet?: string | null;
}) {
  const updated = await patchLocalSplitBill(input.splitId, (split) => {
    const participants = split.participants.map((participant) => {
      if (participant.id !== input.participantId) return participant;
      const paidAmount = input.amountUsdc == null ? participant.amountUsdc : formatUsdc(input.amountUsdc);
      return {
        ...participant,
        paid: input.paid,
        paidAt: input.paid ? Date.now() : undefined,
        paidTxHash: input.paid ? input.txHash : undefined,
        payerWallet: input.paid ? optionalAddress(input.payerWallet) : undefined,
        amountPaid: input.paid ? paidAmount : undefined,
        overpaid: input.paid ? amountNumber(paidAmount) > amountNumber(participant.amountUsdc) : undefined,
        underpaid: input.paid ? amountNumber(paidAmount) < amountNumber(participant.amountUsdc) : undefined,
      };
    });
    return finalizeLocalSplit({ ...split, participants });
  });
  if (!updated) throw new Error('Split bill not found.');
  return updated;
}

async function addLocalSplitReceived(input: { splitId: string; amountUsdc: string | number }) {
  const updated = await patchLocalSplitBill(input.splitId, (split) => {
    const received = amountNumber(split.receivedUsdc) + amountNumber(input.amountUsdc);
    return finalizeLocalSplit({ ...split, receivedUsdc: formatUsdc(received) });
  });
  if (!updated) throw new Error('Split bill not found.');
  return updated;
}

function assertAddress(address: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) throw new Error('Invalid wallet address.');
  return address.trim() as `0x${string}`;
}

function optionalAddress(address?: string | null): `0x${string}` | undefined {
  const trimmed = address?.trim();
  if (!trimmed) return undefined;
  return assertAddress(trimmed);
}

function amountNumber(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatUsdc(value: string | number) {
  return amountNumber(value).toFixed(2);
}

function toTimestamp(value?: string | null) {
  return value ? new Date(value).getTime() : undefined;
}

function toIso(value?: number) {
  return value ? new Date(value).toISOString() : null;
}

function participantFromRow(row: ParticipantRow): SplitParticipant {
  const amount = amountNumber(row.amount_usdc);
  const paidAmount = amountNumber(row.amount_paid_usdc ?? row.amount_usdc);
  return {
    id: row.id,
    name: row.name,
    address: optionalAddress(row.wallet),
    amountUsdc: formatUsdc(row.amount_usdc),
    paid: row.paid,
    paidAt: toTimestamp(row.paid_at),
    paidTxHash: row.tx_hash ?? undefined,
    payerWallet: optionalAddress(row.payer_wallet),
    amountPaid: row.amount_paid_usdc == null ? undefined : formatUsdc(row.amount_paid_usdc),
    overpaid: row.paid && paidAmount > amount,
    underpaid: row.paid && paidAmount < amount,
  };
}

function billFromRow(row: SplitBillRow, participants: SplitParticipant[]): SplitBill {
  const receiverWallet = assertAddress(row.receiver_wallet);
  return {
    id: row.id,
    creatorAddress: receiverWallet,
    receiverWallet,
    totalUsdc: formatUsdc(row.total_usdc),
    peopleCount: row.people_count,
    autoDivide: row.auto_divide,
    completeByTotal: row.complete_by_total,
    note: row.note ?? undefined,
    expiresAt: toTimestamp(row.expires_at),
    status: row.status,
    trackingMode: row.complete_by_total ? 'total_received' : 'per_person',
    receivedUsdc: formatUsdc(row.received_usdc ?? 0),
    participants,
    createdAt: toTimestamp(row.created_at) ?? Date.now(),
    updatedAt: toTimestamp(row.updated_at ?? row.created_at) ?? Date.now(),
  };
}

export function expiryMsFromPreset(preset: SplitExpiryPreset) {
  if (preset === 'none') return undefined;
  const now = Date.now();
  if (preset === '24h') return now + 24 * 60 * 60 * 1000;
  if (preset === '7d') return now + 7 * 24 * 60 * 60 * 1000;
  return now + 48 * 60 * 60 * 1000;
}

export function isExpired(split: SplitBill, now = Date.now()) {
  return split.status === 'open' && Boolean(split.expiresAt && now > split.expiresAt);
}

export function splitStatus(split: SplitBill): SplitBillStatus {
  if (split.status === 'open' && isExpired(split)) return 'expired';
  return split.status;
}

export function splitLifecycleStatus(split: SplitBill): SplitBillStatus | 'partial' {
  const status = splitStatus(split);
  if (status !== 'open') return status;
  const progress = splitProgress(split);
  if (progress.complete) return 'complete';
  if (progress.paid > 0 || amountNumber(progress.receivedUsdc) > 0) return 'partial';
  return 'open';
}


function splitPaymentIntentId(input: { splitId: string; participantId?: string; txHash?: string }) {
  if (input.txHash) return `split_tx_${input.txHash.toLowerCase()}`;
  if (input.participantId) return `split_participant_${input.splitId}_${input.participantId}`;
  return `split_total_${input.splitId}_${Date.now()}`;
}
export async function expireOpenSplitBills() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    await loadLocalSplitBills();
    return;
  }
  try {
    await supabase.rpc('expire_open_split_bills');
  } catch {
    await loadLocalSplitBills();
  }
}

export async function loadSplitBills(): Promise<SplitBill[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return loadLocalSplitBills();

  try {
    await supabase.rpc('expire_open_split_bills');

    const { data: billRows, error: billError } = await supabase
      .from('split_bills')
      .select('*')
      .order('created_at', { ascending: false });

    if (billError) throw new Error(billError.message);
    const bills = (billRows ?? []) as SplitBillRow[];
    const ids = bills.map((bill) => bill.id);

    let participantRows: ParticipantRow[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .in('split_bill_id', ids)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      participantRows = (data ?? []) as ParticipantRow[];
    }

    const remote = bills.map((bill) => {
      const participants = participantRows
        .filter((participant) => participant.split_bill_id === bill.id)
        .map(participantFromRow);
      return billFromRow(bill, participants);
    });
    const local = await loadLocalSplitBills();
    return [...local, ...remote].sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return loadLocalSplitBills();
  }
}

export async function getSplitBillById(id: string): Promise<SplitBill | null> {
  if (isLocalSplitId(id)) return getLocalSplitBillById(id);

  const supabase = getSupabaseClient();
  if (!supabase) return getLocalSplitBillById(id);

  try {
    await supabase.rpc('expire_open_split_bills');

    const { data: billRow, error: billError } = await supabase
      .from('split_bills')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (billError) throw new Error(billError.message);
    if (!billRow) return getLocalSplitBillById(id);

    const { data: participantRows, error: participantError } = await supabase
      .from('participants')
      .select('*')
      .eq('split_bill_id', id)
      .order('created_at', { ascending: true });

    if (participantError) throw new Error(participantError.message);
    return billFromRow(billRow as SplitBillRow, ((participantRows ?? []) as ParticipantRow[]).map(participantFromRow));
  } catch {
    return getLocalSplitBillById(id);
  }
}

export async function createSplitBill(input: {
  creatorAddress?: string;
  receiverWallet?: string;
  totalUsdc: string;
  peopleCount?: number;
  autoDivide?: boolean;
  completeByTotal?: boolean;
  note?: string;
  expiresAt?: number;
  participants: Array<{ name: string; address?: string; amountUsdc: string }>;
}) {
  const receiverWallet = assertAddress(input.receiverWallet ?? input.creatorAddress ?? '');
  const total = amountNumber(input.totalUsdc);
  if (total <= 0) throw new Error('Total amount must be greater than 0.');
  if (input.participants.length === 0) throw new Error('Add at least one participant.');

  const assignedTotal = input.participants.reduce((sum, item) => sum + amountNumber(item.amountUsdc), 0);
  if (Math.abs(assignedTotal - total) > 0.01) {
    throw new Error(`Participant amounts must add up to ${total.toFixed(2)} USDC.`);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = await saveLocalSplitBill(makeLocalSplitBill(input, receiverWallet, total));
    await recordSplitCreatedActivity(local);
    return local;
  }

  try {
    const { data: billRow, error: billError } = await supabase
      .from('split_bills')
      .insert({
        note: input.note?.trim() || null,
        total_usdc: total.toFixed(2),
        people_count: input.peopleCount ?? input.participants.length,
        auto_divide: input.autoDivide ?? true,
        complete_by_total: input.completeByTotal ?? true,
        status: 'open',
        expires_at: toIso(input.expiresAt),
        receiver_wallet: receiverWallet,
        received_usdc: '0.00',
      })
      .select('*')
      .single();

    if (billError) throw new Error(billError.message);

    const participantPayload = input.participants.map((participant) => {
      const amount = amountNumber(participant.amountUsdc);
      if (!participant.name.trim()) throw new Error('Participant name is required.');
      if (amount <= 0) throw new Error('Participant amount must be greater than 0.');
      return {
        split_bill_id: billRow.id,
        name: participant.name.trim(),
        wallet: participant.address?.trim() || null,
        amount_usdc: amount.toFixed(2),
        paid: false,
      };
    });

    const { error: participantError } = await supabase.from('participants').insert(participantPayload);
    if (participantError) {
      await supabase.from('split_bills').delete().eq('id', billRow.id);
      throw new Error(participantError.message);
    }

    const created = await getSplitBillById(billRow.id);
    if (!created) throw new Error('Split bill was created but could not be loaded.');
    await recordSplitCreatedActivity(created);
    return created;
  } catch {
    const local = await saveLocalSplitBill(makeLocalSplitBill(input, receiverWallet, total));
    await recordSplitCreatedActivity(local);
    return local;
  }
}

async function markParticipantPaidRpc(
  supabase: ReturnType<typeof requireSupabaseClient>,
  input: { participantId: string; txHash?: string; amountUsdc?: string | number | null; payerWallet?: string | null },
) {
  const payload = {
    p_participant_id: input.participantId,
    p_tx_hash: input.txHash ?? null,
    p_amount_usdc: input.amountUsdc == null ? null : amountNumber(input.amountUsdc),
    p_payer_wallet: input.payerWallet ?? null,
  };
  const { error } = await supabase.rpc('mark_participant_paid', payload);
  if (!error) return;

  const canFallback = error.message.includes('p_payer_wallet') || error.message.toLowerCase().includes('function');
  if (!canFallback) throw new Error(error.message);

  const { error: fallbackError } = await supabase.rpc('mark_participant_paid', {
    p_participant_id: payload.p_participant_id,
    p_tx_hash: payload.p_tx_hash,
    p_amount_usdc: payload.p_amount_usdc,
  });
  if (fallbackError) throw new Error(fallbackError.message);
}

async function resetParticipantPaid(supabase: ReturnType<typeof requireSupabaseClient>, splitId: string, participantId: string) {
  const { error } = await supabase
    .from('participants')
    .update({ paid: false, paid_at: null, tx_hash: null, payer_wallet: null, amount_paid_usdc: null })
    .eq('id', participantId)
    .eq('split_bill_id', splitId);
  if (!error) return;

  const canFallback = error.message.includes('payer_wallet') || error.message.includes('amount_paid_usdc');
  if (!canFallback) throw new Error(error.message);

  const { error: fallbackError } = await supabase
    .from('participants')
    .update({ paid: false, paid_at: null, tx_hash: null })
    .eq('id', participantId)
    .eq('split_bill_id', splitId);
  if (fallbackError) throw new Error(fallbackError.message);
}
export async function updateSplitParticipantPaid(splitId: string, participantId: string, paid: boolean, txHash?: string) {
  const supabase = getSupabaseClient();
  const split = await getSplitBillById(splitId);
  if (!split) throw new Error('Split bill not found.');

  const participant = split.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error('Split participant not found.');

  const lifecycle = splitLifecycleStatus(split) as SplitLifecycleStatus;

  if (paid) {
    const guard = splitPaymentGuard({
      lifecycleStatus: lifecycle,
      completeByTotal: split.completeByTotal,
      participantId,
      participantPaid: participant.paid,
      sameParticipantTx: Boolean(txHash && participant.paidTxHash?.toLowerCase() === txHash.toLowerCase()),
    });
    if (!guard.allowed) {
      if (guard.duplicate) return;
      throw new Error(guard.reason ?? 'Split payment is not allowed.');
    }

    if (!supabase || isLocalSplitId(splitId)) {
      await setLocalParticipantPaid({ splitId, participantId, paid: true, txHash, amountUsdc: participant.amountUsdc });
      await recordSplitActivity({ splitId, participantId, txHash, amountUsdc: participant.amountUsdc, manual: true });
      return;
    }

    try {
      await markParticipantPaidRpc(supabase, { participantId, txHash, amountUsdc: null });
    } catch {
      await setLocalParticipantPaid({ splitId, participantId, paid: true, txHash, amountUsdc: participant.amountUsdc });
    }
    await recordSplitActivity({ splitId, participantId, txHash, amountUsdc: participant.amountUsdc, manual: true });
    return;
  }

  if (!participant.paid) return;
  if (!supabase || isLocalSplitId(splitId)) {
    await setLocalParticipantPaid({ splitId, participantId, paid: false });
    return;
  }

  try {
    await resetParticipantPaid(supabase, splitId, participantId);
    await supabase.rpc('refresh_split_bill_status', { target_bill_id: splitId });
  } catch {
    await setLocalParticipantPaid({ splitId, participantId, paid: false });
  }
}
async function recordSplitActivity(input: {
  splitId: string;
  participantId?: string;
  amountUsdc: string;
  txHash?: string;
  payerWallet?: string;
  manual?: boolean;
}) {
  const split = await getSplitBillById(input.splitId);
  if (!split) return;
  const participant = split.participants.find((item) => item.id === input.participantId);
  const amount = input.amountUsdc === '0.00' && participant ? participant.amountUsdc : input.amountUsdc;
  const now = Date.now();
  const intentId = splitPaymentIntentId(input);
  const intent = await upsertPaymentIntent({
    id: intentId,
    type: 'split',
    amount,
    tokenSymbol: 'USDC',
    receiverWallet: split.receiverWallet,
    senderWallet: input.payerWallet as `0x${string}` | undefined,
    splitId: input.splitId,
    participantId: input.participantId,
    txHash: input.txHash,
    status: 'confirmed',
    paidAt: now,
    label: participant ? `Split payment - ${participant.name}` : 'Split payment',
    note: split.note,
  });

  await recordActivity({
    id: input.txHash ? `split_tx_${input.txHash.toLowerCase()}` : `split_${input.splitId}_${input.participantId ?? now}`,
    type: 'split_payment',
    amount,
    token: 'USDC',
    direction: 'incoming',
    status: 'confirmed',
    timestamp: now,
    txHash: input.txHash,
    sourceFeature: 'split',
    counterparty: input.payerWallet,
    label: participant ? `${participant.name} paid split` : input.manual ? 'Split participant marked paid' : 'Split payment recorded',
    note: split.note,
    paymentIntentId: intent?.id ?? intentId,
    splitId: input.splitId,
    participantId: input.participantId,
  });

  void recordNotification({
    type: 'payment',
    title: participant ? 'Participant paid' : 'Split payment recorded',
    message: `${amount} USDC received for ${split.note ?? 'split bill'}.`,
    route: `/split/${input.splitId}`,
    data: { splitId: input.splitId, participantId: input.participantId, txHash: input.txHash },
    silent: true,
  });
}
export async function recordSplitPayment(input: { splitId?: string; participantId?: string; amountUsdc: string; txHash?: string; payerWallet?: string }) {
  if (!input.splitId) return;
  const supabase = getSupabaseClient();
  const split = await getSplitBillById(input.splitId);
  if (!split) throw new Error('Split bill not found.');

  const lifecycle = splitLifecycleStatus(split) as SplitLifecycleStatus;
  const participant = input.participantId ? split.participants.find((item) => item.id === input.participantId) : undefined;
  if (input.participantId && !participant) throw new Error('Split participant not found.');

  const guard = splitPaymentGuard({
    lifecycleStatus: lifecycle,
    completeByTotal: split.completeByTotal,
    participantId: input.participantId,
    participantPaid: participant?.paid ?? false,
    sameParticipantTx: Boolean(input.txHash && participant?.paidTxHash?.toLowerCase() === input.txHash.toLowerCase()),
  });
  if (!guard.allowed) {
    if (guard.duplicate) return;
    throw new Error(guard.reason ?? 'Split payment is not allowed.');
  }

  if (input.participantId) {
    if (!supabase || isLocalSplitId(input.splitId)) {
      await setLocalParticipantPaid({
        splitId: input.splitId,
        participantId: input.participantId,
        paid: true,
        txHash: input.txHash,
        amountUsdc: input.amountUsdc,
        payerWallet: input.payerWallet ?? null,
      });
    } else {
      try {
        await markParticipantPaidRpc(supabase, {
          participantId: input.participantId,
          txHash: input.txHash,
          amountUsdc: input.amountUsdc,
          payerWallet: input.payerWallet ?? null,
        });
      } catch {
        await setLocalParticipantPaid({
          splitId: input.splitId,
          participantId: input.participantId,
          paid: true,
          txHash: input.txHash,
          amountUsdc: input.amountUsdc,
          payerWallet: input.payerWallet ?? null,
        });
      }
    }
    await recordSplitActivity({
      splitId: input.splitId,
      participantId: input.participantId,
      amountUsdc: input.amountUsdc,
      txHash: input.txHash,
      payerWallet: input.payerWallet,
    });
    return;
  }

  if (!supabase || isLocalSplitId(input.splitId)) {
    await addLocalSplitReceived({ splitId: input.splitId, amountUsdc: input.amountUsdc });
  } else {
    try {
      const { error } = await supabase.rpc('record_split_received', {
        p_split_bill_id: input.splitId,
        p_amount_usdc: amountNumber(input.amountUsdc),
      });
      if (error) throw new Error(error.message);
    } catch {
      await addLocalSplitReceived({ splitId: input.splitId, amountUsdc: input.amountUsdc });
    }
  }
  await recordSplitActivity({
    splitId: input.splitId,
    amountUsdc: input.amountUsdc,
    txHash: input.txHash,
    payerWallet: input.payerWallet,
  });
}
export async function cancelSplitBill(splitId: string) {
  const supabase = getSupabaseClient();
  if (!supabase || isLocalSplitId(splitId)) {
    await patchLocalSplitBill(splitId, (split) => ({ ...split, status: 'cancelled', updatedAt: Date.now() }));
  } else {
    try {
      const { error } = await supabase
        .from('split_bills')
        .update({ status: 'cancelled' })
        .eq('id', splitId)
        .in('status', ['open', 'expired']);
      if (error) throw new Error(error.message);
    } catch {
      await patchLocalSplitBill(splitId, (split) => ({ ...split, status: 'cancelled', updatedAt: Date.now() }));
    }
  }

  await recordActivity({
    id: `split_cancel_${splitId}`,
    type: 'request',
    direction: 'neutral',
    status: 'cancelled',
    timestamp: Date.now(),
    sourceFeature: 'split',
    label: 'Split bill cancelled',
    splitId,
  });
}

export function buildParticipantPaymentLink(split: SplitBill, participant: SplitParticipant) {
  return buildSmartQrLink({
    type: 'split',
    splitId: split.id,
    participantId: participant.id,
    address: split.receiverWallet,
    amount: participant.amountUsdc,
    token: 'USDC',
    label: split.note ? `${split.note} - ${participant.name}` : `Split bill - ${participant.name}`,
  });
}

export function buildSplitPaymentLink(split: SplitBill) {
  const shareAmount = split.participants[0]?.amountUsdc ?? formatUsdc(amountNumber(split.totalUsdc) / Math.max(1, split.peopleCount));
  return buildSmartQrLink({
    type: 'split',
    splitId: split.id,
    address: split.receiverWallet,
    amount: shareAmount,
    token: 'USDC',
    label: split.note ? `${split.note} - ${shareAmount} USDC share` : `Split bill - ${shareAmount} USDC share`,
  });
}

export function splitProgress(split: SplitBill) {
  return calculateSplitProgress(split);
}

export function buildAllPaymentLinksText(split: SplitBill, participants = split.participants) {
  const lines = [
    `T Pay Split Bill - ${split.note ?? 'Split bill'} - ${split.totalUsdc} USDC`,
    'Please pay your share:',
    ...participants.map((participant) => `${participant.name}: ${buildParticipantPaymentLink(split, participant)}`),
  ];
  return lines.join('\n');
}

export function buildReminderText(split: SplitBill) {
  const unpaid = split.participants.filter((participant) => !participant.paid);
  const lines = [
    'Hey! Still waiting on payment',
    ...unpaid.map((participant) => `${participant.name}: ${buildParticipantPaymentLink(split, participant)}`),
  ];
  return lines.join('\n');
}









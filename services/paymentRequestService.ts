// services/paymentRequestService.ts
// Smart QR v2 parser/builder for T Pay checkout, requests, split bills, markets, and wallet sends.

export type SmartQrType = 'invoice' | 'pay' | 'request' | 'split' | 'market' | 'send' | 'profile' | 'merchant';

export type ParsedPaymentRequest =
  | {
      kind: 'invoice';
      invoiceId: string;
      merchant?: `0x${string}`;
      amount?: string;
      token?: string;
      label?: string;
      raw: string;
    }
  | {
      kind: 'market';
      marketId: string;
      label?: string;
      raw: string;
    }
  | {
      kind: 'send';
      address: `0x${string}`;
      amount?: string;
      token?: string;
      label?: string;
      raw: string;
    }
  | {
      kind: 'request';
      address: `0x${string}`;
      amount?: string;
      token?: string;
      label?: string;
      raw: string;
    }
  | {
      kind: 'split';
      address: `0x${string}`;
      amount?: string;
      token?: string;
      label?: string;
      splitId?: string;
      participantId?: string;
      raw: string;
    }
  | {
      kind: 'profile';
      address: `0x${string}`;
      label?: string;
      raw: string;
    }
  | {
      kind: 'merchant';
      merchant: `0x${string}`;
      label?: string;
      raw: string;
    }
  | {
      kind: 'unknown';
      reason: string;
      raw: string;
    };

export type SmartQrPayload =
  | { type: 'invoice'; invoiceId: string; merchant?: string; amount?: string; token?: string; label?: string }
  | { type: 'request'; address: string; amount?: string; token?: string; label?: string }
  | { type: 'split'; address: string; amount?: string; token?: string; label?: string; splitId?: string; participantId?: string }
  | { type: 'market'; marketId: string; label?: string }
  | { type: 'send'; address: string; amount?: string; token?: string; label?: string }
  | { type: 'profile'; address: string; label?: string }
  | { type: 'merchant'; merchant: string; label?: string };

const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;

function decode(value?: string | null) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function getQueryValue(raw: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`[?&]${escaped}=([^&#]+)`, 'i').exec(raw);
  return decode(match?.[1]);
}

function normalizeAmount(rawAmount?: string) {
  if (!rawAmount) return undefined;
  const trimmed = rawAmount.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return trimmed;
}

function firstValue(raw: string, names: string[]) {
  for (const name of names) {
    const value = getQueryValue(raw, name);
    if (value) return value;
  }
  return undefined;
}

function queryAddress(raw: string, names: string[]) {
  const value = firstValue(raw, names);
  const address = value?.match(ADDRESS_RE)?.[0] ?? raw.match(ADDRESS_RE)?.[0];
  return address as `0x${string}` | undefined;
}

function parseEip681Amount(raw: string) {
  const amount = firstValue(raw, ['amount', 'value']);
  if (amount) return normalizeAmount(amount);

  const uint256 = getQueryValue(raw, 'uint256');
  if (!uint256 || !/^\d+$/.test(uint256)) return undefined;

  // Most USDC transfer QR payloads encode uint256 in 6-decimal token units.
  if (uint256.length <= 6) return `0.${uint256.padStart(6, '0')}`.replace(/0+$/, '').replace(/\.$/, '');
  return `${uint256.slice(0, -6)}.${uint256.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '');
}

function parsePathMarketId(raw: string) {
  const match = /(?:market|markets)\/(\d+)/i.exec(raw);
  return match?.[1];
}

function parseJsonPayload(raw: string): ParsedPaymentRequest | null {
  if (!raw.startsWith('{')) return null;
  try {
    const json = JSON.parse(raw) as Partial<SmartQrPayload> & { tpay?: string; v?: number };
    if (!json || typeof json !== 'object' || !json.type) return null;
    return parseSmartPayload(json as SmartQrPayload, raw);
  } catch {
    return null;
  }
}

function parseSmartPayload(payload: SmartQrPayload, raw: string): ParsedPaymentRequest {
  if (payload.type === 'invoice' && payload.invoiceId) {
    const merchant = payload.merchant?.match(ADDRESS_RE)?.[0] as `0x${string}` | undefined;
    return { kind: 'invoice', invoiceId: payload.invoiceId, merchant, amount: normalizeAmount(payload.amount), token: payload.token, label: payload.label, raw };
  }

  if (payload.type === 'market' && payload.marketId) {
    return { kind: 'market', marketId: String(payload.marketId), label: payload.label, raw };
  }

  if ((payload.type === 'send' || payload.type === 'request' || payload.type === 'split' || payload.type === 'profile') && 'address' in payload) {
    const address = payload.address?.match(ADDRESS_RE)?.[0] as `0x${string}` | undefined;
    if (!address) return { kind: 'unknown', reason: 'Smart QR address is invalid.', raw };
    if (payload.type === 'profile') return { kind: 'profile', address, label: payload.label, raw };
    if (payload.type === 'request') return { kind: 'request', address, amount: normalizeAmount(payload.amount), token: payload.token, label: payload.label, raw };
    if (payload.type === 'split') return { kind: 'split', address, amount: normalizeAmount(payload.amount), token: payload.token, label: payload.label, splitId: payload.splitId, participantId: payload.participantId, raw };
    return { kind: 'send', address, amount: normalizeAmount(payload.amount), token: payload.token, label: payload.label, raw };
  }

  if (payload.type === 'merchant') {
    const merchant = payload.merchant?.match(ADDRESS_RE)?.[0] as `0x${string}` | undefined;
    if (merchant) return { kind: 'merchant', merchant, label: payload.label, raw };
  }

  return { kind: 'unknown', reason: 'Smart QR payload is missing required fields.', raw };
}

export function buildSmartQrLink(payload: SmartQrPayload) {
  const path = payload.type === 'invoice' ? 'pay' : payload.type;
  const params = new URLSearchParams({ v: '2', type: payload.type });

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'type' || value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });

  return `tpay://${path}?${params.toString()}`;
}

export function parsePaymentRequest(input: string): ParsedPaymentRequest {
  const raw = input.trim();
  if (!raw) {
    return { kind: 'unknown', reason: 'QR code is empty.', raw: input };
  }

  const jsonRequest = parseJsonPayload(raw);
  if (jsonRequest) return jsonRequest;

  const smartType = (getQueryValue(raw, 'type') ?? getQueryValue(raw, 'kind'))?.toLowerCase() as SmartQrType | undefined;

  const invoiceId = firstValue(raw, ['invoiceId', 'invoice_id', 'id']);
  const looksLikePayRoute =
    smartType === 'invoice' ||
    smartType === 'pay' ||
    /^(?:tpay|tpay|tpay):\/\/pay/i.test(raw) ||
    /\/pay(\?|$)/i.test(raw) ||
    /--\/pay(\?|$)/i.test(raw);

  if (invoiceId && looksLikePayRoute) {
    const merchant = queryAddress(raw, ['merchant', 'merchantAddress']);
    return {
      kind: 'invoice',
      invoiceId,
      merchant,
      amount: normalizeAmount(firstValue(raw, ['amount', 'value'])),
      token: firstValue(raw, ['token', 'symbol']),
      label: firstValue(raw, ['label', 'memo', 'note']),
      raw,
    };
  }

  const marketId = firstValue(raw, ['marketId', 'market_id', smartType === 'market' ? 'id' : 'market']) ?? parsePathMarketId(raw);
  const looksLikeMarketRoute =
    smartType === 'market' ||
    /^(?:tpay|tpay|tpay):\/\/market/i.test(raw) ||
    /^(?:tpay|tpay|tpay):\/\/markets/i.test(raw) ||
    /\/market(s)?(\/|\?|$)/i.test(raw) ||
    /--\/market(s)?(\/|\?|$)/i.test(raw);

  if (marketId && looksLikeMarketRoute) {
    return { kind: 'market', marketId, label: firstValue(raw, ['label', 'question']), raw };
  }

  const looksLikeRequest = smartType === 'request' || /^(?:tpay|tpay|tpay):\/\/request/i.test(raw) || /\/request(\?|$)/i.test(raw);
  if (looksLikeRequest) {
    const address = queryAddress(raw, ['address', 'recipient', 'to', 'payee', 'requester']);
    if (address) {
      return { kind: 'request', address, amount: normalizeAmount(firstValue(raw, ['amount', 'value'])), token: firstValue(raw, ['token', 'symbol']) ?? 'USDC', label: firstValue(raw, ['label', 'memo', 'note']), raw };
    }
  }

  const looksLikeSplit = smartType === 'split' || /^(?:tpay|tpay|tpay):\/\/split/i.test(raw) || /\/split(\?|$)/i.test(raw);
  if (looksLikeSplit) {
    const address = queryAddress(raw, ['address', 'recipient', 'to', 'collector']);
    if (address) {
      return { kind: 'split', address, amount: normalizeAmount(firstValue(raw, ['amount', 'share', 'shareAmount', 'value'])), token: firstValue(raw, ['token', 'symbol']) ?? 'USDC', label: firstValue(raw, ['label', 'memo', 'note']), splitId: firstValue(raw, ['splitId', 'split_id', 'id']), participantId: firstValue(raw, ['participantId', 'participant_id', 'partId']), raw };
    }
  }

  const looksLikeProfile = smartType === 'profile' || /^(?:tpay|tpay|tpay):\/\/profile/i.test(raw) || /\/profile(\?|$)/i.test(raw);
  if (looksLikeProfile) {
    const address = queryAddress(raw, ['address', 'wallet', 'user']);
    if (address) return { kind: 'profile', address, label: firstValue(raw, ['label', 'name']), raw };
  }

  const looksLikeMerchant = smartType === 'merchant' || /^(?:tpay|tpay|tpay):\/\/merchant/i.test(raw) || /\/merchant(\?|$)/i.test(raw);
  if (looksLikeMerchant) {
    const merchant = queryAddress(raw, ['merchant', 'merchantAddress', 'address']);
    if (merchant) return { kind: 'merchant', merchant, label: firstValue(raw, ['label', 'name']), raw };
  }

  const address = raw.match(ADDRESS_RE)?.[0];
  if (address) {
    return {
      kind: 'send',
      address: address as `0x${string}`,
      amount: parseEip681Amount(raw),
      token: firstValue(raw, ['token', 'symbol']) ?? (raw.toLowerCase().startsWith('ethereum:') ? 'USDC' : undefined),
      label: firstValue(raw, ['label', 'memo', 'note']),
      raw,
    };
  }

  return { kind: 'unknown', reason: 'QR code is not a T Pay invoice, request, split bill, market, or wallet address.', raw };
}

export function buildSendParamsFromRequest(

  request: Extract<ParsedPaymentRequest, { kind: 'send' | 'request' | 'split' | 'profile' }>,

) {

  return {

    address: request.address,

    ...(request.kind !== 'profile' && request.amount ? { amount: request.amount } : {}),

    ...(request.kind !== 'profile' && request.token ? { token: request.token } : {}),

    ...(request.kind === 'split' && request.splitId ? { splitId: request.splitId } : {}),

    ...(request.kind === 'split' && request.participantId ? { participantId: request.participantId } : {}),

  };

}

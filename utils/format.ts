import { formatDistanceToNow, format } from 'date-fns';
import { formatUnits, parseUnits } from 'viem';

export function formatUsdc(raw: bigint, decimals = 2): string {
  const value = formatUnits(raw, 6);
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function parseUsdc(amount: string): bigint {
  const parsed = decimalInputToBigInt(amount, 6);
  if (parsed === null) throw new Error('Invalid USDC amount');
  return parsed;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrency(amount: number, currency: 'USD' | 'VND') {
  return currency === 'VND' ? formatVnd(amount) : formatUsd(amount);
}

export function formatDualCurrency(amountUsd: number, usdToVndRate: number) {
  return `${formatUsd(amountUsd)} / ${formatVnd(amountUsd * usdToVndRate)}`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function shortenHash(hash: string, chars = 6): string {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function timeAgo(timestamp: number): string {
  const normalized = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return formatDistanceToNow(new Date(normalized), { addSuffix: true });
}

export function formatTxDate(timestamp: number): string {
  const normalized = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return format(new Date(normalized), 'MMM d · HH:mm');
}

export function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function normalizeDecimalInput(value: string | number): string {
  const raw = String(value ?? '0').trim().replace(/\s/g, '') || '0';
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) return raw.replace(/,/g, '');
  if (hasComma) return raw.replace(/,/g, '.');
  return raw;
}

export function isValidAmount(value: string): boolean {
  const normalized = normalizeDecimalInput(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return false;
  const parsed = decimalInputToBigInt(normalized, 18);
  return parsed !== null && parsed > 0n;
}

export function sanitizeAmount(value: string): string {
  return sanitizeDecimalInput(value);
}

export function sanitizeDecimalInput(value: string, maxDecimals?: number): string {
  let output = '';
  let separator: '.' | ',' | null = null;
  let fractionDigits = 0;

  for (const char of value) {
    if (char >= '0' && char <= '9') {
      if (separator && maxDecimals !== undefined && fractionDigits >= maxDecimals) continue;
      output += char;
      if (separator) fractionDigits += 1;
      continue;
    }

    if ((char === '.' || char === ',') && !separator) {
      separator = char;
      output = output === '' ? '0' + char : output + char;
    }
  }

  return output;
}

export function decimalFractionDigits(value: string): number {
  const sanitized = sanitizeDecimalInput(value.trim());
  const dotIndex = sanitized.indexOf('.');
  const commaIndex = sanitized.indexOf(',');
  const separatorIndex = dotIndex === -1 ? commaIndex : commaIndex === -1 ? dotIndex : Math.min(dotIndex, commaIndex);
  return separatorIndex === -1 ? 0 : sanitized.length - separatorIndex - 1;
}

export function getDecimalInputError(value: string, decimals: number): string | null {
  const sanitized = sanitizeDecimalInput(value.trim());
  if (!sanitized) return null;
  if (!/^\d+([.,]\d*)?$/.test(sanitized)) return 'Invalid amount';
  if (decimalFractionDigits(sanitized) > decimals) return 'Too many decimal places';
  return null;
}

export function decimalInputToBigInt(value: string, decimals: number): bigint | null {
  const sanitized = sanitizeDecimalInput(value.trim());
  if (!sanitized || getDecimalInputError(sanitized, decimals)) return null;

  const normalized = normalizeDecimalInput(sanitized);
  if (normalized.endsWith('.')) return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  try {
    const parsed = parseUnits(normalized, decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
export function formatTokenAmount(raw: bigint, decimals: number, displayDecimals = 2): string {
  const value = formatUnits(raw, decimals);
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}



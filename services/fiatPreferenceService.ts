import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export type FiatCurrency = 'USD' | 'VND' | 'EUR';

export interface FiatRatesSnapshot {
  base: 'USD';
  rates: Record<FiatCurrency, number>;
  source: 'coingecko' | 'internal' | 'cache';
  timestamp: number;
}

const DEFAULT_RATES: Record<FiatCurrency, number> = { USD: 1, VND: 25_500, EUR: 0.92 };
const RATES_TTL_MS = 5 * 60 * 1000;
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd,vnd,eur';

let memoryRates: FiatRatesSnapshot | null = null;
let memoryCurrency: FiatCurrency | null = null;

function isFresh(snapshot: FiatRatesSnapshot | null) {
  return Boolean(snapshot && Date.now() - snapshot.timestamp < RATES_TTL_MS);
}

function normalizeCurrency(value?: string | null): FiatCurrency {
  return value === 'VND' || value === 'EUR' || value === 'USD' ? value : 'USD';
}

export async function getFiatCurrency(): Promise<FiatCurrency> {
  if (memoryCurrency) return memoryCurrency;
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.FIAT_CURRENCY);
  memoryCurrency = normalizeCurrency(raw);
  return memoryCurrency;
}

export async function setFiatCurrency(currency: FiatCurrency) {
  memoryCurrency = currency;
  await AsyncStorage.setItem(STORAGE_KEYS.FIAT_CURRENCY, currency);
}

async function loadCachedRates(): Promise<FiatRatesSnapshot | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.FIAT_RATES);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FiatRatesSnapshot;
    if (!parsed?.rates?.USD || !parsed?.timestamp) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveRates(snapshot: FiatRatesSnapshot) {
  memoryRates = snapshot;
  await AsyncStorage.setItem(STORAGE_KEYS.FIAT_RATES, JSON.stringify(snapshot));
}

export async function getFiatRates(forceRefresh = false): Promise<FiatRatesSnapshot> {
  if (!forceRefresh && isFresh(memoryRates)) return memoryRates!;
  const cached = await loadCachedRates();
  if (!forceRefresh && isFresh(cached)) {
    memoryRates = cached;
    return cached!;
  }

  try {
    const { data } = await axios.get(COINGECKO_URL, { timeout: 6_000 });
    const usdc = data?.['usd-coin'];
    const rates: Record<FiatCurrency, number> = {
      USD: Number(usdc?.usd) || 1,
      VND: Number(usdc?.vnd) || DEFAULT_RATES.VND,
      EUR: Number(usdc?.eur) || DEFAULT_RATES.EUR,
    };
    const snapshot: FiatRatesSnapshot = { base: 'USD', rates, source: 'coingecko', timestamp: Date.now() };
    await saveRates(snapshot);
    return snapshot;
  } catch {
    if (cached) return { ...cached, source: 'cache' };
    const fallback: FiatRatesSnapshot = { base: 'USD', rates: DEFAULT_RATES, source: 'internal', timestamp: Date.now() };
    await saveRates(fallback);
    return fallback;
  }
}

export function formatFiatAmount(amountUsd: number, currency: FiatCurrency, rates: FiatRatesSnapshot) {
  const amount = amountUsd * (rates.rates[currency] ?? 1);
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(amount);
}

export function rateAgeLabel(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

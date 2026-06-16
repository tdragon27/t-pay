import axios from 'axios';

export type FiatRateSource = 'coingecko' | 'binance' | 'internal';

export interface UsdToVndRate {
  usdToVndRate: number;
  source: FiatRateSource;
  timestamp: number;
}

const BINANCE_USDT_VND_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=USDTVND';
const COINGECKO_USD_VND_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=vnd';
const DEFAULT_USD_TO_VND = 25_500;
const RATE_TTL_MS = 15_000;

let cachedRate: UsdToVndRate | null = null;

function isFresh(rate: UsdToVndRate | null) {
  return Boolean(rate && Date.now() - rate.timestamp < RATE_TTL_MS);
}

async function fetchFromBinance(): Promise<UsdToVndRate | null> {
  try {
    const { data } = await axios.get(BINANCE_USDT_VND_URL, { timeout: 6_000 });
    const price = Number(data?.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      usdToVndRate: price,
      source: 'binance',
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchFromCoinGecko(): Promise<UsdToVndRate | null> {
  try {
    const { data } = await axios.get(COINGECKO_USD_VND_URL, { timeout: 6_000 });
    const price = Number(data?.['usd-coin']?.vnd);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      usdToVndRate: price,
      source: 'coingecko',
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function getUsdToVndRate(forceRefresh = false): Promise<UsdToVndRate> {
  if (!forceRefresh && isFresh(cachedRate)) {
    return cachedRate!;
  }

  const binanceRate = await fetchFromBinance();
  if (binanceRate) {
    cachedRate = binanceRate;
    return binanceRate;
  }

  const coinGeckoRate = await fetchFromCoinGecko();
  if (coinGeckoRate) {
    cachedRate = coinGeckoRate;
    return coinGeckoRate;
  }

  const fallbackRate: UsdToVndRate = {
    usdToVndRate: DEFAULT_USD_TO_VND,
    source: 'internal',
    timestamp: Date.now(),
  };

  cachedRate = fallbackRate;
  return fallbackRate;
}

export function convertUsdToLocal(amountUsd: number, currency: 'USD' | 'VND', usdToVndRate: number) {
  return currency === 'VND' ? amountUsd * usdToVndRate : amountUsd;
}

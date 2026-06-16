import { parseUnits } from 'viem';
import { z } from 'zod';
import { TtlCache } from './cache';

export const fxQuoteRequestSchema = z.object({
  fromSymbol: z.enum(['USDC', 'USDT', 'EURC']),
  toSymbol: z.enum(['USDC', 'USDT', 'EURC']),
  amount: z.string().min(1),
  amountMode: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']).default('EXACT_INPUT'),
  localCurrency: z.enum(['USD', 'VND']).default('VND'),
  slippageBps: z.coerce.number().min(1).max(1_000).default(50),
  deadlineSeconds: z.coerce.number().min(15).max(900).default(90),
  tenor: z.string().default('instant'),
});

export type FxQuoteRequest = z.infer<typeof fxQuoteRequestSchema>;

const circleQuoteSchema = z.object({
  rate: z.coerce.number().optional(),
  expiresAt: z.string().optional(),
  from: z.object({ currency: z.string().optional(), amount: z.coerce.number().or(z.string()).optional() }).optional(),
  to: z.object({ currency: z.string().optional(), amount: z.coerce.number().or(z.string()).optional() }).optional(),
});

const quoteCache = new TtlCache<any>();
const stableRefCache = new TtlCache<Record<'USDC' | 'USDT' | 'EURC', { usd: number }>>();
const rateCache = new TtlCache<{ usdToVndRate: number; source: 'coingecko' | 'binance' | 'internal'; timestamp: number }>();

const STABLEFX_URL = 'https://api.circle.com/v1/exchange/stablefx/quotes';
const COINGECKO_SIMPLE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,euro-coin&vs_currencies=usd';
const BINANCE_USDT_VND_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=USDTVND';
const COINGECKO_USD_VND_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=vnd';
const QUOTE_TTL_MS = 8_000;
const RATE_TTL_MS = 15_000;
const DEFAULT_USD_TO_VND = 25_500;
const STABLEFX_FEE_BPS = 10;

function cleanAmount(amount: string) {
  return amount.replace(/,/g, '').trim();
}

function amountToRaw(amount: string, decimals: number) {
  const normalized = cleanAmount(amount);
  if (!normalized.includes('.')) return parseUnits(normalized, decimals).toString();

  const [whole, fraction] = normalized.split('.');
  return parseUnits(`${whole}.${(fraction ?? '').slice(0, decimals)}`, decimals).toString();
}

async function fetchJsonWithRetries(url: string, init: RequestInit, retries = 3, timeoutMs = 6_000) {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function getUsdToVndRate() {
  const cached = rateCache.get('usd-vnd');
  if (cached) return cached;

  try {
    const response = await fetchJsonWithRetries(BINANCE_USDT_VND_URL, { method: 'GET' }, 2, 4_000);
    if (response.ok) {
      const data = await response.json();
      const quote = {
        usdToVndRate: Number(data?.price ?? DEFAULT_USD_TO_VND),
        source: 'binance' as const,
        timestamp: Date.now(),
      };
      rateCache.set('usd-vnd', quote, RATE_TTL_MS);
      return quote;
    }
  } catch {}

  try {
    const response = await fetchJsonWithRetries(COINGECKO_USD_VND_URL, { method: 'GET' }, 2, 4_000);
    if (response.ok) {
      const data = await response.json();
      const quote = {
        usdToVndRate: Number(data?.['usd-coin']?.vnd ?? DEFAULT_USD_TO_VND),
        source: 'coingecko' as const,
        timestamp: Date.now(),
      };
      rateCache.set('usd-vnd', quote, RATE_TTL_MS);
      return quote;
    }
  } catch {}

  const fallback = {
    usdToVndRate: DEFAULT_USD_TO_VND,
    source: 'internal' as const,
    timestamp: Date.now(),
  };
  rateCache.set('usd-vnd', fallback, RATE_TTL_MS);
  return fallback;
}

async function getStableReferences() {
  const cached = stableRefCache.get('stable-refs');
  if (cached) return cached;

  try {
    const response = await fetchJsonWithRetries(COINGECKO_SIMPLE_URL, { method: 'GET' }, 2, 4_000);
    if (!response.ok) throw new Error('coingecko unavailable');

    const data = await response.json();
    const refs = {
      USDC: { usd: Number(data?.['usd-coin']?.usd ?? 1) },
      USDT: { usd: Number(data?.tether?.usd ?? 1) },
      EURC: { usd: Number(data?.['euro-coin']?.usd ?? 1.08) },
    };
    stableRefCache.set('stable-refs', refs, RATE_TTL_MS);
    return refs;
  } catch {
    const fallback = {
      USDC: { usd: 1 },
      USDT: { usd: 1 },
      EURC: { usd: 1.08 },
    };
    stableRefCache.set('stable-refs', fallback, RATE_TTL_MS);
    return fallback;
  }
}

function buildNormalizedQuote(input: {
  request: FxQuoteRequest;
  provider: 'stablefx';
  source: 'STABLEFX';
  amountIn: number;
  amountOut: number;
  feeBps: number;
  note: string;
  expiresAt: number;
  stableRefs: Record<'USDC' | 'USDT' | 'EURC', { usd: number }>;
  usdToVndRate: number;
}) {
  const { request, provider, source, amountIn, amountOut, feeBps, note, expiresAt, stableRefs, usdToVndRate } = input;
  const fromDecimals = 6;
  const toDecimals = 6;
  const minOut = request.amountMode === 'EXACT_INPUT' ? amountOut * ((10_000 - request.slippageBps) / 10_000) : amountOut;
  const maxIn = request.amountMode === 'EXACT_OUTPUT' ? amountIn * ((10_000 + request.slippageBps) / 10_000) : undefined;
  const idealOut = (amountIn * stableRefs[request.fromSymbol].usd) / stableRefs[request.toSymbol].usd;
  const priceImpact = request.amountMode === 'EXACT_INPUT'
    ? Math.max(0, ((idealOut - amountOut) / Math.max(idealOut, 0.000001)) * 100)
    : Math.max(0, ((amountIn - ((amountOut * stableRefs[request.toSymbol].usd) / stableRefs[request.fromSymbol].usd)) / Math.max((amountOut * stableRefs[request.toSymbol].usd) / stableRefs[request.fromSymbol].usd, 0.000001)) * 100);

  return {
    provider,
    source,
    requestMode: request.amountMode,
    fromToken: request.fromSymbol,
    toToken: request.toSymbol,
    inputAmount: amountIn,
    expectedOut: amountOut,
    minOut,
    maxIn,
    rate: amountOut / Math.max(amountIn, 0.000001),
    fee: amountIn * (feeBps / 10_000),
    feeBps,
    priceImpact,
    slippageBps: request.slippageBps,
    deadline: expiresAt,
    timestamp: Date.now(),
    amountIn: amountIn.toFixed(6),
    amountOut: amountOut.toFixed(6),
    amountInRaw: amountToRaw(amountIn.toFixed(6), fromDecimals),
    amountOutRaw: amountToRaw(amountOut.toFixed(6), toDecimals),
    minOutRaw: amountToRaw(minOut.toFixed(6), toDecimals),
    maxInRaw: maxIn ? amountToRaw(maxIn.toFixed(6), fromDecimals) : undefined,
    localCurrency: request.localCurrency,
    localIn: request.localCurrency === 'VND' ? amountIn * stableRefs[request.fromSymbol].usd * usdToVndRate : amountIn * stableRefs[request.fromSymbol].usd,
    localOut: request.localCurrency === 'VND' ? amountOut * stableRefs[request.toSymbol].usd * usdToVndRate : amountOut * stableRefs[request.toSymbol].usd,
    note,
  };
}

async function requestStableFxQuote(request: FxQuoteRequest, stableRefs: Record<'USDC' | 'USDT' | 'EURC', { usd: number }>, usdToVndRate: number) {
  const apiKey = process.env.CIRCLE_STABLEFX_API_KEY ?? process.env.CIRCLE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetchJsonWithRetries(
      STABLEFX_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          request.amountMode === 'EXACT_OUTPUT'
            ? {
                from: { currency: request.fromSymbol },
                to: { currency: request.toSymbol, amount: cleanAmount(request.amount) },
                tenor: request.tenor,
              }
            : {
                from: { currency: request.fromSymbol, amount: cleanAmount(request.amount) },
                to: { currency: request.toSymbol },
                tenor: request.tenor,
              },
        ),
      },
      3,
      6_000,
    );

    if (!response.ok) {
      return null;
    }

    const payload = circleQuoteSchema.safeParse(await response.json());
    if (!payload.success) {
      return null;
    }

    const amountIn = Number(payload.data.from?.amount ?? cleanAmount(request.amount));
    const amountOut = Number(payload.data.to?.amount ?? 0);
    if (!Number.isFinite(amountIn) || !Number.isFinite(amountOut) || amountIn <= 0 || amountOut <= 0) {
      return null;
    }

    const expiresAt = payload.data.expiresAt ? new Date(payload.data.expiresAt).getTime() : Date.now() + request.deadlineSeconds * 1000;

    return buildNormalizedQuote({
      request,
      provider: 'stablefx',
      source: 'STABLEFX',
      amountIn,
      amountOut,
      feeBps: STABLEFX_FEE_BPS,
      note: 'StableFX quote from Circle backend proxy with retry and schema validation.',
      expiresAt,
      stableRefs,
      usdToVndRate,
    });
  } catch {
    return null;
  }
}

export async function getNormalizedFxQuote(request: FxQuoteRequest) {
  const cacheKey = JSON.stringify(request);
  const cached = quoteCache.get(cacheKey);
  if (cached) return cached;

  const stableRefs = await getStableReferences();
  const vndRate = await getUsdToVndRate();

  const stableFxQuote = await requestStableFxQuote(request, stableRefs, vndRate.usdToVndRate);
  if (stableFxQuote) {
    quoteCache.set(cacheKey, stableFxQuote, QUOTE_TTL_MS);
    return stableFxQuote;
  }

  throw new Error('StableFX quote unavailable. Configure a live Circle StableFX API key or disable the backend FX route.');
}

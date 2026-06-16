import { formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ARC_CONTRACTS,
  FX_TOKENS,
  type FxExecutionMode,
  type FxQuoteSource,
  type FxTokenSymbol,
} from '@/constants/chains';
import {
  estimateArcStableSwapWithAppKit,
  executeArcStableSwapWithAppKit,
  isArcAppKitSwapAvailable,
} from '@/lib/arcAppKit';
import { ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { loadPrivateKey } from '@/lib/wallet';
import { convertUsdToLocal, getUsdToVndRate } from '@/services/fiatRateService';
import { normalizeDecimalInput } from '@/utils/format';

export type LocalCurrency = 'USD' | 'VND';
export type FxProvider = 'stablefx' | 'dex';
export type QuoteRequestMode = 'EXACT_INPUT' | 'EXACT_OUTPUT';

export interface MarketTicker {
  symbol: FxTokenSymbol | 'BTC' | 'ETH';
  name: string;
  priceUsd: number | null;
  priceVnd: number | null;
  change24h: number;
  accent: string;
}

export interface FxQuote {
  provider: FxProvider;
  source: FxQuoteSource;
  requestMode: QuoteRequestMode;
  fromToken: FxTokenSymbol;
  toToken: FxTokenSymbol;
  fromSymbol: FxTokenSymbol;
  toSymbol: FxTokenSymbol;
  inputAmount: number;
  expectedOut: number;
  minOut: number;
  maxIn?: number;
  rate: number;
  fee: number;
  feeBps: number;
  priceImpact: number;
  slippageBps: number;
  deadline: number;
  timestamp: number;
  localCurrency: LocalCurrency;
  localIn: number;
  localOut: number;
  amountIn: string;
  amountOut: string;
  amountInRaw: bigint;
  amountOutRaw: bigint;
  minOutRaw: bigint;
  maxInRaw?: bigint;
  expiresAt: number;
  note: string;
  routeId?: string;
  routeLabel?: string;
  routeSymbols?: string[];
  routePath?: `0x${string}`[];
}

export interface FxSwapResult {
  provider: FxProvider;
  source: FxQuoteSource;
  txHash: string;
  amountOut: string;
  quote: FxQuote;
}

const DEFAULT_DEADLINE_SECONDS = 90;
const DEFAULT_SLIPPAGE_BPS = 50;

// Arc App Kit docs: among testnets, Arc Testnet Swap supports USDC, EURC, and cirBTC only.
const ARC_APP_KIT_SWAP_SYMBOLS = new Set<FxTokenSymbol>(['USDC', 'EURC', 'cirBTC']);

const DISPLAY_USD: Partial<Record<FxTokenSymbol, number>> = {
  USDC: 1,
  USDT: 1,
  EURC: 1.08,
  DAI: 1,
  PYUSD: 1,
};

function displayUsd(symbol: FxTokenSymbol) {
  return DISPLAY_USD[symbol] ?? null;
}

function parseAmount(value: string | number, decimals: number) {
  const normalized = normalizeDecimalInput(value);
  if (normalized === '.') return 0n;
  const [whole, fraction = ''] = normalized.split('.');
  return parseUnits((whole || '0') + '.' + fraction.slice(0, decimals), decimals);
}

function rawToNumber(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals));
}

function rawToDisplay(raw: bigint, decimals: number) {
  const maxDecimals = Math.min(decimals, 8);
  return rawToNumber(raw, decimals).toLocaleString('en-US', {
    minimumFractionDigits: decimals === 8 ? 6 : 2,
    maximumFractionDigits: maxDecimals,
  });
}

function decimalString(raw: bigint, decimals: number) {
  return formatUnits(raw, decimals);
}

function normalizePrivateKey(privateKey: string): `0x${string}` {
  const trimmed = privateKey.trim();
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

function isDexConfigured(fromSymbol: FxTokenSymbol, toSymbol: FxTokenSymbol) {
  return Boolean(ARC_CONTRACTS.DEX_ROUTER && FX_TOKENS[fromSymbol].address && FX_TOKENS[toSymbol].address);
}

function resolveProvider(fromSymbol: FxTokenSymbol, toSymbol: FxTokenSymbol, override?: FxExecutionMode): FxProvider {
  if (override === 'dex') return 'dex';
  if (override === 'stablefx') return 'stablefx';
  return isArcAppKitSwapAvailable(fromSymbol, toSymbol) ? 'stablefx' : 'dex';
}

function compactFxError(error: unknown, fallback: string) {
  const raw = (error as any)?.shortMessage || (error as any)?.message || String(error || fallback);
  const firstLine = raw.split('\n')[0]?.trim() || fallback;
  const lower = firstLine.toLowerCase();

  if (lower.includes('insufficient')) return firstLine;
  if (lower.includes('kit key') || lower.includes('app kit')) return firstLine;
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timed out')) {
    return 'Unable to reach the live Arc swap provider. Check your internet connection and try again.';
  }
  if (lower.includes('not supported') || lower.includes('not configured')) return firstLine;

  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

async function readTokenBalanceForPrivateKey(privateKey: string, symbol: FxTokenSymbol) {
  const token = FX_TOKENS[symbol];
  if (!token?.address) throw new Error(`${symbol} contract address is not configured for Arc Testnet.`);

  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  const raw = await getPublicClient().readContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  return raw as bigint;
}

export function getArcSupportedFxTokenSymbols(): FxTokenSymbol[] {
  return (Object.keys(FX_TOKENS) as FxTokenSymbol[]).filter((symbol) => {
    const token = FX_TOKENS[symbol];
    if (!token.address) return false;
    if (ARC_APP_KIT_SWAP_SYMBOLS.has(symbol)) return true;
    return Boolean(ARC_CONTRACTS.DEX_ROUTER || process.env.EXPO_PUBLIC_TPAY_BACKEND_URL);
  });
}

export function isLiveFxPairSupported(fromSymbol: FxTokenSymbol, toSymbol: FxTokenSymbol) {
  if (fromSymbol === toSymbol) return false;
  return isArcAppKitSwapAvailable(fromSymbol, toSymbol);
}

export async function fetchMarketTickers(): Promise<MarketTicker[]> {
  const rate = await getUsdToVndRate().catch(() => ({ usdToVndRate: 25500 }));
  return getArcSupportedFxTokenSymbols().map((symbol) => {
    const priceUsd = displayUsd(symbol);
    return {
      symbol,
      name: FX_TOKENS[symbol].name,
      priceUsd,
      priceVnd: priceUsd === null ? null : convertUsdToLocal(priceUsd, 'VND', rate.usdToVndRate),
      change24h: 0,
      accent: FX_TOKENS[symbol].accent,
    };
  });
}

export async function getFxQuote(input: {
  fromSymbol: FxTokenSymbol;
  toSymbol: FxTokenSymbol;
  amount: string;
  amountMode?: QuoteRequestMode;
  localCurrency?: LocalCurrency;
  slippageBps?: number;
  deadlineSeconds?: number;
  providerOverride?: FxExecutionMode;
}): Promise<FxQuote> {
  const fromToken = FX_TOKENS[input.fromSymbol];
  const toToken = FX_TOKENS[input.toSymbol];
  if (!fromToken || !toToken) throw new Error('Unsupported Arc Testnet asset.');
  if (!fromToken.address || !toToken.address) throw new Error('Selected token address is not configured for Arc Testnet.');
  if (input.fromSymbol === input.toSymbol) throw new Error('Choose two different assets to swap.');

  const requestMode = input.amountMode || 'EXACT_INPUT';
  const slippageBps = input.slippageBps || DEFAULT_SLIPPAGE_BPS;
  const deadline = Date.now() + (input.deadlineSeconds || DEFAULT_DEADLINE_SECONDS) * 1000;
  const provider = resolveProvider(input.fromSymbol, input.toSymbol, input.providerOverride);

  if (requestMode !== 'EXACT_INPUT') {
    throw new Error('Receive exact is not available for this route yet. Use Spend exact to continue.');
  }

  if (provider === 'dex' || !isArcAppKitSwapAvailable(input.fromSymbol, input.toSymbol)) {
    const dexHint = isDexConfigured(input.fromSymbol, input.toSymbol)
      ? 'A DEX router is configured, but DEX execution is not wired in this build.'
      : 'Set a valid Circle swap configuration to enable same-chain swaps.';
    throw new Error(`No connected Arc swap route is available for ${input.fromSymbol} -> ${input.toSymbol}. ${dexHint}`);
  }

  const amountInRaw = parseAmount(input.amount, fromToken.decimals);
  if (amountInRaw <= 0n) throw new Error('Enter an amount greater than 0.');

  const privateKey = await loadPrivateKey();
  if (!privateKey) throw new Error('Wallet private key is not available. Unlock or import a wallet first.');

  try {
    const appKitQuote = await estimateArcStableSwapWithAppKit({
      privateKey,
      fromSymbol: input.fromSymbol,
      toSymbol: input.toSymbol,
      amount: decimalString(amountInRaw, fromToken.decimals),
      slippageBps,
    });

    const amountOutRaw = parseAmount(appKitQuote.expectedOut, toToken.decimals);
    const minOutRaw = parseAmount(appKitQuote.minOut || appKitQuote.expectedOut, toToken.decimals);
    const inputAmount = rawToNumber(amountInRaw, fromToken.decimals);
    const expectedOut = rawToNumber(amountOutRaw, toToken.decimals);
    const minOut = rawToNumber(minOutRaw, toToken.decimals);
    const rate = inputAmount > 0 ? expectedOut / inputAmount : 0;
    const fiatRate = await getUsdToVndRate().catch(() => ({ usdToVndRate: 25500 }));
    const localCurrency = input.localCurrency || 'VND';
    const fromUsd = displayUsd(input.fromSymbol);
    const toUsd = displayUsd(input.toSymbol);

    return {
      provider,
      source: 'STABLEFX',
      requestMode,
      fromToken: input.fromSymbol,
      toToken: input.toSymbol,
      fromSymbol: input.fromSymbol,
      toSymbol: input.toSymbol,
      inputAmount,
      expectedOut,
      minOut,
      rate,
      fee: Number(appKitQuote.fee || 0),
      feeBps: 0,
      priceImpact: 0,
      slippageBps,
      deadline,
      timestamp: Date.now(),
      localCurrency,
      localIn: fromUsd === null ? 0 : convertUsdToLocal(inputAmount * fromUsd, localCurrency, fiatRate.usdToVndRate),
      localOut: toUsd === null ? 0 : convertUsdToLocal(expectedOut * toUsd, localCurrency, fiatRate.usdToVndRate),
      amountIn: rawToDisplay(amountInRaw, fromToken.decimals),
      amountOut: rawToDisplay(amountOutRaw, toToken.decimals),
      amountInRaw,
      amountOutRaw,
      minOutRaw,
      expiresAt: deadline,
      note: 'Quote powered by Circle on Arc Testnet. Review before confirming the swap.',
      routeId: 'appkit-swap',
      routeLabel: 'Circle',
      routeSymbols: [input.fromSymbol, input.toSymbol],
    };
  } catch (err) {
    throw new Error(compactFxError(err, 'Unable to fetch an Arc swap quote right now.'));
  }
}

export async function executeFxSwap(input: {
  fromSymbol: FxTokenSymbol;
  toSymbol: FxTokenSymbol;
  amount: string;
  amountMode?: QuoteRequestMode;
  localCurrency?: LocalCurrency;
  slippageBps?: number;
  providerOverride?: FxExecutionMode;
  quote?: FxQuote;
}): Promise<FxSwapResult> {
  const quote = input.quote || await getFxQuote(input);
  if (Date.now() > quote.deadline) throw new Error('Quote expired. Please refresh the quote before executing.');
  if (quote.requestMode !== 'EXACT_INPUT') throw new Error('Only Spend exact swaps can be executed in this App Kit build.');

  if (!isArcAppKitSwapAvailable(quote.fromToken, quote.toToken)) {
    throw new Error(`No live Arc App Kit swap route is available for ${quote.fromToken} -> ${quote.toToken}.`);
  }

  const privateKey = await loadPrivateKey();
  if (!privateKey) throw new Error('Wallet private key is not available. Unlock or import a wallet first.');

  const fromToken = FX_TOKENS[quote.fromToken];
  const balanceRaw = await readTokenBalanceForPrivateKey(privateKey, quote.fromToken);
  if (balanceRaw < quote.amountInRaw) {
    throw new Error(
      `Insufficient ${quote.fromToken} balance. You have ${rawToDisplay(balanceRaw, fromToken.decimals)} ${quote.fromToken}, but need ${quote.amountIn} ${quote.fromToken}.`,
    );
  }

  try {
    const result = await executeArcStableSwapWithAppKit({
      privateKey,
      fromSymbol: quote.fromToken,
      toSymbol: quote.toToken,
      amount: decimalString(quote.amountInRaw, fromToken.decimals),
      slippageBps: quote.slippageBps,
    });

    return {
      provider: quote.provider,
      source: quote.source,
      txHash: result.txHash,
      amountOut: result.amountOut || quote.amountOut,
      quote,
    };
  } catch (err) {
    throw new Error(compactFxError(err, 'Swap failed. Please try again.'));
  }
}



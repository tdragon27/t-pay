import React, { useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '@/constants/theme';
import { FX_TOKENS, type FxTokenSymbol } from '@/constants/chains';
import {
  executeFxSwap,
  getArcSupportedFxTokenSymbols,
  getFxQuote,
  isLiveFxPairSupported,
  type FxQuote,
  type FxSwapResult,
  type LocalCurrency,
  type QuoteRequestMode,
} from '@/services/fxService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ensureCriticalAuth } from '@/services/securityService';
import { useBalance } from '@/hooks/useBalance';
import { useWalletStore } from '@/store/walletStore';
import { isSupportedArcTokenSymbol } from '@/constants/tokens';
import { decimalInputToBigInt, getDecimalInputError, sanitizeDecimalInput } from '@/utils/format';

function isFxSymbol(value: unknown): value is FxTokenSymbol {
  return typeof value === 'string' && value in FX_TOKENS;
}

function formatFxBalance(raw: bigint | null | undefined, symbol: FxTokenSymbol) {
  if (raw === null || raw === undefined) return '—';
  const token = FX_TOKENS[symbol];
  const value = Number(formatUnits(raw, token.decimals));
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: token.decimals === 8 ? 6 : 2,
    maximumFractionDigits: token.decimals === 8 ? 6 : 2,
  })} ${symbol}`;
}

function TokenChip({
  symbol,
  active,
  onPress,
  balanceLabel,
}: {
  symbol: FxTokenSymbol;
  active: boolean;
  onPress: () => void;
  balanceLabel?: string;
}) {
  const token = FX_TOKENS[symbol];
  return (
    <TouchableOpacity
      style={[styles.tokenChip, active && { borderColor: token.accent, backgroundColor: `${token.accent}20` }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.tokenChipTop}>
        <View style={[styles.tokenDot, { backgroundColor: token.accent }]} />
        <Text
          style={[styles.tokenChipText, active && { color: Colors.text1 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {symbol}
        </Text>
      </View>
      {balanceLabel ? (
        <Text style={[styles.tokenChipBalance, active && { color: token.accent }]} numberOfLines={1}>
          {balanceLabel}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteRowLabel}>{label}</Text>
      <Text style={styles.quoteRowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function FxScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromSymbol?: string; toSymbol?: string }>();
  const { isOffline } = useNetworkStatus();
  const { refetch: refetchBalances } = useBalance();
  const { tokenBalances, isBalanceLoading } = useWalletStore();
  const initialFrom = isFxSymbol(params.fromSymbol) ? params.fromSymbol : 'USDC';
  const initialTo = isFxSymbol(params.toSymbol) && params.toSymbol !== initialFrom ? params.toSymbol : 'EURC';
  const [fromSymbol, setFromSymbol] = useState<FxTokenSymbol>(initialFrom);
  const [toSymbol, setToSymbol] = useState<FxTokenSymbol>(initialTo);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [result, setResult] = useState<FxSwapResult | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewingSwap, setReviewingSwap] = useState(false);

  const tokenSymbols = useMemo(() => getArcSupportedFxTokenSymbols(), []);
  const amountMode: QuoteRequestMode = 'EXACT_INPUT';
  const localCurrency: LocalCurrency = 'VND';
  const slippageBps = 50;
  const livePairSupported = isLiveFxPairSupported(fromSymbol, toSymbol);
  const amountInputError = useMemo(() => getDecimalInputError(amount, FX_TOKENS[fromSymbol].decimals), [amount, fromSymbol]);
  const amountRaw = useMemo(() => decimalInputToBigInt(amount, FX_TOKENS[fromSymbol].decimals), [amount, fromSymbol]);
  const fromBalanceState = isSupportedArcTokenSymbol(fromSymbol) ? tokenBalances[fromSymbol] : null;
  const fromBalanceRaw = fromBalanceState?.raw ?? null;
  const fromBalanceLabel = fromBalanceState ? formatFxBalance(fromBalanceState.raw, fromSymbol) : '—';
  const payTokenSymbols = useMemo(() => {
    const funded = tokenSymbols.filter(
      (symbol) => isSupportedArcTokenSymbol(symbol) && (tokenBalances[symbol]?.raw ?? 0n) > 0n,
    );
    return funded.length > 0 ? funded : tokenSymbols;
  }, [tokenBalances, tokenSymbols]);
  const receiveTokenSymbols = useMemo(
    () => tokenSymbols.filter((symbol) => symbol !== fromSymbol),
    [fromSymbol, tokenSymbols],
  );
  const balanceError = useMemo(() => {
    if (amountInputError) return amountInputError;
    if (!amountRaw || amountRaw <= 0n) return null;
    if (!isSupportedArcTokenSymbol(fromSymbol)) return null;
    if (fromBalanceRaw === null) {
      return isBalanceLoading
        ? `Scanning ${fromSymbol} balance before swap...`
        : `Unable to confirm ${fromSymbol} balance. Refresh balances before swapping.`;
    }
    if (amountRaw > fromBalanceRaw) {
      return `Insufficient ${fromSymbol} balance. Available: ${formatFxBalance(fromBalanceRaw, fromSymbol)}.`;
    }
    return null;
  }, [amountInputError, amountRaw, fromBalanceRaw, fromSymbol, isBalanceLoading]);
  const canQuote = Boolean(amountRaw && amountRaw > 0n && !balanceError && fromSymbol !== toSymbol && livePairSupported);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await refetchBalances();
      if (canQuote) await handleQuote();
    } finally {
      setRefreshing(false);
    }
  }

  function resetQuoteState() {
    setQuote(null);
    setResult(null);
    setReviewingSwap(false);
    setError(null);
  }

  function selectFromSymbol(symbol: FxTokenSymbol) {
    setFromSymbol(symbol);
    if (symbol === toSymbol) {
      setToSymbol(tokenSymbols.find((item) => item !== symbol) ?? symbol);
    }
    resetQuoteState();
  }

  function selectToSymbol(symbol: FxTokenSymbol) {
    if (symbol === fromSymbol) return;
    setToSymbol(symbol);
    resetQuoteState();
  }

  async function handleQuote() {
    if (!amount || !amountRaw || amountRaw <= 0n) {
      setQuote(null);
      if (amountInputError) setError(amountInputError);
      return;
    }

    if (balanceError) {
      setError(balanceError);
      setQuote(null);
      return;
    }

    if (!livePairSupported) {
      setError(`Swapping ${fromSymbol} to ${toSymbol} is not connected yet.`);
      setQuote(null);
      return;
    }

    setLoadingQuote(true);
    setError(null);
    setResult(null);

    try {
      const nextQuote = await getFxQuote({
        fromSymbol,
        toSymbol,
        amount,
        amountMode,
        localCurrency,
        slippageBps,
      });
      setQuote(nextQuote);
      setReviewingSwap(false);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to fetch a quote right now.');
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }

  async function handleExecute() {
    if (!quote) return;
    if (isOffline) {
      setError('No internet connection - swaps are disabled in read-only mode.');
      return;
    }
    if (balanceError) {
      setError(balanceError);
      return;
    }

    const unlocked = await ensureCriticalAuth();
    if (!unlocked) {
      setError('PIN or biometric unlock is required before confirming a swap.');
      return;
    }

    setExecuting(true);
    setError(null);

    try {
      const swapResult = await executeFxSwap({
        fromSymbol,
        toSymbol,
        amount,
        amountMode,
        localCurrency,
        slippageBps,
        quote,
      });
      setResult(swapResult);
      setQuote(swapResult.quote);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Swap Successful', text2: `${swapResult.amountOut} ${toSymbol} is ready.` });
      void refetchBalances();
    } catch (err: any) {
      setError(err?.message ?? 'Swap failed. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setExecuting(false);
    }
  }

  function switchSides() {
    Haptics.selectionAsync();
    setQuote(null);
    setResult(null);
    setReviewingSwap(false);
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
  }

  const receivePreview = quote ? `${quote.amountOut} ${quote.toToken}` : `Select ${toSymbol}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text1} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Swap</Text>
            <Text style={styles.headerSub}>Exchange supported assets</Text>
          </View>
          <TouchableOpacity onPress={refreshAll} style={styles.iconBtn}>
            <Ionicons name="refresh" size={20} color={Colors.text2} />
          </TouchableOpacity>
        </View>

        <Card style={styles.swapCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.panelTitle}>You Pay</Text>
            <Text style={styles.balanceLine}>Balance: {fromBalanceLabel}</Text>
          </View>

          <Input
            label={`Amount (${fromSymbol})`}
            value={amount}
            onChangeText={(value) => {
              setAmount(sanitizeDecimalInput(value, FX_TOKENS[fromSymbol].decimals));
              resetQuoteState();
            }}
            placeholder={fromSymbol === 'cirBTC' ? '0.0001' : '0.00'}
            keyboardType="decimal-pad"
          />

          {balanceError ? (
            <View style={styles.inlineWarning}>
              <Ionicons name="alert-circle-outline" size={15} color={Colors.warning} />
              <Text style={styles.inlineWarningText}>{balanceError}</Text>
            </View>
          ) : null}

          <View style={styles.tokenGrid}>
            {payTokenSymbols.map((symbol) => (
              <TokenChip
                key={`from-${symbol}`}
                symbol={symbol}
                active={symbol === fromSymbol}
                balanceLabel={isSupportedArcTokenSymbol(symbol) ? formatFxBalance(tokenBalances[symbol]?.raw, symbol) : undefined}
                onPress={() => selectFromSymbol(symbol)}
              />
            ))}
          </View>
        </Card>

        <View style={styles.switchWrap}>
          <TouchableOpacity style={styles.switchBtn} onPress={switchSides}>
            <Ionicons name="swap-vertical" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <Card style={styles.swapCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.panelTitle}>You Receive</Text>
            <Text style={styles.receivePreview} numberOfLines={1}>{receivePreview}</Text>
          </View>

          <View style={styles.tokenGrid}>
            {receiveTokenSymbols.map((symbol) => (
              <TokenChip
                key={`to-${symbol}`}
                symbol={symbol}
                active={symbol === toSymbol}
                onPress={() => selectToSymbol(symbol)}
              />
            ))}
          </View>

          {!livePairSupported ? (
            <View style={styles.routeHint}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.text3} />
              <Text style={styles.routeHintText}>{fromSymbol} to {toSymbol} is not connected yet.</Text>
            </View>
          ) : null}
        </Card>

        {!quote ? (
          <Button
            label={loadingQuote ? 'Loading quote...' : 'Get Quote'}
            loading={loadingQuote}
            disabled={!canQuote}
            onPress={handleQuote}
          />
        ) : null}

        {loadingQuote && !quote && <Skeleton style={styles.quoteSkeleton} />}

        {quote && (
          <Card style={styles.quoteCard}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>{reviewingSwap ? 'Review Swap' : 'Swap Preview'}</Text>
                <Text style={styles.quoteHeadline} numberOfLines={1}>{quote.amountIn} {quote.fromToken} → {quote.amountOut} {quote.toToken}</Text>
              </View>
            </View>

            <View style={styles.quoteRows}>
              <QuoteRow label="Rate" value={`1 ${quote.fromToken} = ${quote.rate.toFixed(4)} ${quote.toToken}`} />
              <QuoteRow label="Fee" value={quote.fee > 0 ? `$${quote.fee.toFixed(4)}` : 'Included'} />
              <QuoteRow label="Provider" value="Circle" />
            </View>

            <Button
              label={isOffline ? 'Offline - Swap Disabled' : reviewingSwap ? (executing ? 'Confirming Swap...' : 'Confirm Swap') : 'Review Swap'}
              loading={executing}
              disabled={isOffline || Boolean(balanceError)}
              onPress={reviewingSwap ? handleExecute : () => setReviewingSwap(true)}
            />
          </Card>
        )}

        {result && (
          <Card style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={34} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Swap Successful</Text>
              <Text style={styles.successSub}>{result.amountOut} {toSymbol} received.</Text>
              <Text style={styles.successHash} numberOfLines={1}>{result.txHash}</Text>
            </View>
          </Card>
        )}

        {error && (
          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: 12, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headerCenter: { alignItems: 'center', gap: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.displaySemiBold, fontSize: 22, color: Colors.text1, letterSpacing: -0.4 },
  headerSub: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs },
  swapCard: {
    gap: 12,
    backgroundColor: 'rgba(18,18,28,0.88)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  panelTitle: { color: Colors.text1, fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.md },
  balanceLine: { color: Colors.text3, fontSize: FontSize.xs, textAlign: 'right', flexShrink: 1 },
  receivePreview: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,183,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.26)',
  },
  inlineWarningText: { flex: 1, color: Colors.warning, fontSize: FontSize.xs, lineHeight: 17 },
  tokenGrid: { flexDirection: 'row', gap: 8, flexWrap: 'nowrap' },
  tokenChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
  },
  tokenChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' },
  tokenDot: { width: 7, height: 7, borderRadius: 7 },
  tokenChipText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '900', maxWidth: '100%' },
  tokenChipBalance: { color: Colors.text3, fontSize: 9, fontWeight: '700', maxWidth: '100%' },
  switchWrap: { alignItems: 'center', marginVertical: -2, zIndex: 2 },
  switchBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,212,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.36)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  routeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 2,
  },
  routeHintText: { color: Colors.text3, fontSize: FontSize.xs, flex: 1 },
  quoteSkeleton: { height: 178, borderRadius: Radius.xl },
  quoteCard: { gap: 14, backgroundColor: 'rgba(18,18,28,0.92)', borderColor: 'rgba(0,212,255,0.15)' },
  quoteHeadline: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '700', marginTop: 4 },
  quoteRows: { gap: 10, paddingTop: 2 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  quoteRowLabel: { color: Colors.text2, fontSize: FontSize.sm },
  quoteRowValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700', flex: 1, textAlign: 'right' },
  successCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: Colors.successBg, borderColor: 'rgba(0,232,143,0.3)' },
  successIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,232,143,0.14)' },
  successTitle: { color: Colors.success, fontSize: FontSize.md, fontWeight: '700' },
  successSub: { color: Colors.text1, fontSize: FontSize.sm, marginTop: 4 },
  successHash: { color: Colors.text3, fontSize: 11, marginTop: 6 },
  errorCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.errorBg, borderColor: 'rgba(255,77,106,0.28)' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, flex: 1 },
});


import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { FX_TOKENS, type FxTokenSymbol } from '@/constants/chains';
import { useMultiChainBalance } from '@/hooks/useMultiChainBalance';
import { getArcSupportedFxTokenSymbols } from '@/services/fxService';
import { buildCrosschainPayPlan } from '@/services/crosschainPayService';
import { assessPaymentRisk } from '@/services/riskService';
import { useWalletStore } from '@/store/walletStore';
import {
  getMerchantInvoiceById,
  loadMerchantInvoices,
  payMerchantInvoice,
  subscribeToMerchantInvoice,
  type MerchantInvoice,
} from '@/services/merchantService';
import { formatCurrency, shortenAddress } from '@/utils/format';

function TokenSelector({
  value,
  onChange,
  tokens,
}: {
  value: FxTokenSymbol;
  onChange: (value: FxTokenSymbol) => void;
  tokens: FxTokenSymbol[];
}) {
  return (
    <View style={styles.tokenRow}>
      {tokens.map((symbol) => (
        <TouchableOpacity
          key={symbol}
          style={[
            styles.tokenPill,
            value === symbol && {
              borderColor: FX_TOKENS[symbol].accent,
              backgroundColor: `${FX_TOKENS[symbol].accent}20`,
            },
          ]}
          onPress={() => onChange(symbol)}
        >
          <View style={[styles.tokenSwatch, { backgroundColor: FX_TOKENS[symbol].accent }]} />
          <Text style={[styles.tokenPillText, value === symbol && { color: Colors.text1 }]}>{symbol}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PayInvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const { address, usdcBalanceFormatted } = useWalletStore();
  const { balances, totalUSD: externalUsdcTotal, isRefreshing: fundingRefreshing, refresh: refreshFunding } = useMultiChainBalance(address);
  const supportedTokens = useMemo(() => getArcSupportedFxTokenSymbols(), []);
  const [invoice, setInvoice] = useState<MerchantInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payerTokenSymbol, setPayerTokenSymbol] = useState<FxTokenSymbol>('USDC');
  const [recentInvoices, setRecentInvoices] = useState<MerchantInvoice[]>([]);

  const fundingPlan = useMemo(() => {
    if (!invoice) return null;
    return buildCrosschainPayPlan({
      requiredAmount: invoice.amount,
      arcBalanceFormatted: usdcBalanceFormatted,
      externalBalances: balances,
    });
  }, [invoice, usdcBalanceFormatted, balances]);

  const riskAssessment = useMemo(() => {
    if (!invoice) return null;
    return assessPaymentRisk({
      operation: 'invoice_pay',
      amount: invoice.amount,
      tokenSymbol: invoice.tokenSymbol,
      merchantAddress: invoice.merchantAddress,
      payerAddress: address,
      label: invoice.label,
    });
  }, [invoice, address]);
  useEffect(() => {
    let active = true;

    async function hydrate() {
      if (!params.invoiceId) {
        const list = await loadMerchantInvoices({ merchantAddress: address ?? undefined, preferBackend: true });
        setRecentInvoices(list.filter((item) => item.status === 'open').slice(0, 8));
        setError(null);
        setLoading(false);
        return;
      }

      const found = await getMerchantInvoiceById(params.invoiceId);
      if (!active) return;

      if (!found) {
        setError('Payment request not found. Ask the merchant to re-share the payment link.');
      } else {
        setInvoice(found);
        setPayerTokenSymbol(supportedTokens.includes(found.tokenSymbol) ? found.tokenSymbol : supportedTokens[0] ?? 'USDC');
      }
      setLoading(false);
    }

    hydrate();
    return () => {
      active = false;
    };
  }, [params.invoiceId, supportedTokens, address]);

  useEffect(() => {
    if (!params.invoiceId) return;
    return subscribeToMerchantInvoice(params.invoiceId, (nextInvoice) => {
      if (nextInvoice) {
        setInvoice(nextInvoice);
        if (nextInvoice.status === 'paid' && nextInvoice.txHash) {
          setTxHash(nextInvoice.txHash);
        }
      }
    });
  }, [params.invoiceId, supportedTokens, address]);

  function openBridgeFunding() {
    if (!invoice || !fundingPlan?.suggestedSource) return;
    router.push({
      pathname: '/bridge' as any,
      params: {
        amount: fundingPlan.missingAmount.toFixed(2),
        destAddress: address ?? invoice.merchantAddress,
        sourceChainId: String(fundingPlan.suggestedSource.chainId),
        direction: 'toArc',
        returnInvoiceId: invoice.id,
      },
    });
  }
  async function handlePay() {
    if (!invoice) return;

    if (riskAssessment && !riskAssessment.allowed) {
      const message = riskAssessment.reasons.join(' ');
      setError(message);
      Alert.alert('Payment blocked', message);
      return;
    }

    if (fundingPlan?.mode === 'fund_arc_first') {
      const message = 'Your USDC is available across chains, but this invoice must settle on Arc. Bridge/fund Arc first, then come back and pay.';
      setError(message);
      Alert.alert('Fund Arc first', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Bridge', onPress: openBridgeFunding },
      ]);
      return;
    }

    if (fundingPlan?.mode === 'insufficient') {
      const message = fundingPlan.message;
      setError(message);
      Alert.alert('Insufficient funds', message);
      return;
    }

    setPaying(true);
    setError(null);

    try {
      const result = await payMerchantInvoice({
        invoiceId: invoice.id,
        payerTokenSymbol,
      });
      setInvoice(result.invoice);
      setTxHash(result.txHash);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to settle payment right now.');
      Alert.alert('Payment failed', err?.message ?? 'Unable to settle payment right now.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pay Request</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.content}>
          <Skeleton style={styles.heroSkeleton} />
          <Skeleton style={styles.detailSkeleton} />
          <Skeleton style={styles.detailSkeleton} />
        </View>
            ) : !invoice ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.landingHero}>
            <View style={styles.landingIcon}>
              <Ionicons name="qr-code-outline" size={26} color={Colors.primary} />
            </View>
            <Text style={styles.landingTitle}>Pay a request</Text>
            <Text style={styles.landingSub}>Scan a T Pay QR, open a payment link, or choose one of your recent open payment requests below.</Text>
            <View style={styles.landingActions}>
              <Button label="Scan QR" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
              <Button label="Merchant QR" variant="secondary" onPress={() => router.push('/merchant')} style={{ flex: 1 }} />
            </View>
          </Card>

          <Card style={styles.detailCard}>
            <Text style={styles.payTitle}>Open payment requests</Text>
            {recentInvoices.length === 0 ? (
              <View style={styles.emptyPayState}>
                <Ionicons name="receipt-outline" size={24} color={Colors.text3} />
                <Text style={styles.paySub}>No open payment requests were found on this device/backend yet.</Text>
              </View>
            ) : (
              recentInvoices.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.payInvoiceRow}
                  onPress={() => router.replace({ pathname: '/pay' as any, params: { invoiceId: item.id } })}
                  activeOpacity={0.78}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payInvoiceTitle} numberOfLines={1}>{item.label}</Text>
                    <Text style={styles.payInvoiceMeta}>{item.amount} {item.tokenSymbol} · {formatCurrency(Number(item.displayAmount || 0), item.displayCurrency)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
                </TouchableOpacity>
              ))
            )}
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Instant checkout</Text>
            <Text style={styles.heroAmount}>
              {invoice.amount} {invoice.tokenSymbol}
            </Text>
            <Text style={styles.heroSub}>
              {formatCurrency(Number(invoice.displayAmount || 0), invoice.displayCurrency)} · {invoice.label}
            </Text>
          </Card>

          <Card style={styles.detailCard}>
            <DetailRow label="Merchant" value={shortenAddress(invoice.merchantAddress, 6)} />
            <DetailRow label="Settlement" value={invoice.settleMode} />
            <DetailRow label="Request ID" value={invoice.id} />
            <DetailRow label="Status" value={invoice.status} />
            <DetailRow label="Expires" value={new Date(invoice.expiresAt).toLocaleString()} />
            {invoice.note ? <DetailRow label="Note" value={invoice.note} /> : null}
          </Card>


          {fundingPlan && (
            <Card style={styles.fundingCard}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.payTitle}>Unified Balance preflight</Text>
                  <Text style={styles.paySub}>Arc docs: use App Kit Unified Balance/Bridge before settlement when funds sit on another chain.</Text>
                </View>
                <TouchableOpacity style={styles.refreshPill} onPress={refreshFunding} disabled={fundingRefreshing}>
                  <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
                  <Text style={styles.refreshText}>{fundingRefreshing ? 'Syncing' : 'Sync'}</Text>
                </TouchableOpacity>
              </View>
              <DetailRow label="Arc USDC" value={`${fundingPlan.arcAmount.toFixed(2)} USDC`} />
              <DetailRow label="Other chains" value={`${externalUsdcTotal.toFixed(2)} USDC`} />
              <DetailRow label="Plan" value={fundingPlan.message} />
              {fundingPlan.suggestedSource ? (
                <DetailRow label="Suggested source" value={`${fundingPlan.suggestedSource.chainName} (${fundingPlan.suggestedSource.balance} USDC)`} />
              ) : null}
              {fundingPlan.mode === 'fund_arc_first' ? (
                <Button
                  label="Open Bridge Funding"
                  variant="secondary"
                  onPress={openBridgeFunding}
                />
              ) : null}
            </Card>
          )}

          {riskAssessment && (riskAssessment.warnings.length > 0 || !riskAssessment.allowed) ? (
            <Card style={!riskAssessment.allowed ? styles.errorCard : styles.warningCard}>
              <Ionicons name={!riskAssessment.allowed ? 'ban-outline' : 'shield-checkmark-outline'} size={18} color={!riskAssessment.allowed ? Colors.error : Colors.warning} />
              <Text style={!riskAssessment.allowed ? styles.errorText : styles.warningText}>
                {(!riskAssessment.allowed ? riskAssessment.reasons : riskAssessment.warnings).join(' ')}
              </Text>
            </Card>
          ) : null}
          <Card style={styles.payCard}>
            <Text style={styles.payTitle}>Choose payment token</Text>
            <Text style={styles.paySub}>
              If you pay with a different token, T Pay will quote a protected swap so the merchant still receives {invoice.amount} {invoice.tokenSymbol}.
            </Text>
            <TokenSelector value={payerTokenSymbol} onChange={setPayerTokenSymbol} tokens={supportedTokens} />
          </Card>

          {txHash ? (
            <Card style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Payment confirmed</Text>
                <Text style={styles.successSub}>{txHash}</Text>
              </View>
            </Card>
          ) : (
            <Button
              label={fundingPlan?.mode === 'fund_arc_first' ? 'Bridge & Return to Pay' : paying ? 'Settling on Arc...' : `Pay with ${payerTokenSymbol}`}
              loading={paying}
              onPress={fundingPlan?.mode === 'fund_arc_first' ? openBridgeFunding : handlePay}
              disabled={invoice.status !== 'open' || !riskAssessment?.allowed || fundingPlan?.mode === 'insufficient'}
            />
          )}

          {error && (
            <Card style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '700' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: Spacing.lg,
  },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm, textAlign: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md },
  heroSkeleton: { height: 160, borderRadius: Radius.xl },
  detailSkeleton: { height: 120, borderRadius: Radius.xl },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#10161F',
    borderColor: '#1E3043',
    paddingVertical: 24,
  },
  heroEyebrow: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroAmount: { color: Colors.text1, fontSize: 32, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 8, textAlign: 'center' },
  landingHero: { alignItems: 'center', gap: 12, paddingVertical: 24, backgroundColor: '#10161F', borderColor: '#1E3043' },
  landingIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
  },
  landingTitle: { color: Colors.text1, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  landingSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  landingActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  emptyPayState: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  payInvoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  payInvoiceTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  payInvoiceMeta: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 3 },  detailCard: { gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  fundingCard: { gap: 12 },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
  },
  refreshText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningBg,
    borderColor: 'rgba(255,181,71,0.28)',
  },
  warningText: { color: Colors.warning, fontSize: FontSize.sm, flex: 1, lineHeight: 19 },
  payCard: { gap: 12 },
  payTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  paySub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tokenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
  },
  tokenSwatch: { width: 8, height: 8, borderRadius: Radius.full },
  tokenPillText: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { color: Colors.text2, fontSize: FontSize.sm },
  detailValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'right', flex: 1 },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.successBg,
    borderColor: 'rgba(0,232,143,0.28)',
  },
  successTitle: { color: Colors.success, fontSize: FontSize.md, fontWeight: '700' },
  successSub: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 4 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.errorBg,
    borderColor: 'rgba(255,77,106,0.28)',
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm, flex: 1 },
});






















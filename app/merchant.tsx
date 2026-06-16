import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { FX_TOKENS, type FxTokenSymbol } from '@/constants/chains';
import { getArcSupportedFxTokenSymbols } from '@/services/fxService';
import { buildMerchantAnalytics, formatMerchantVolume, formatSettlementDuration } from '@/services/merchantAnalyticsService';
import { assessPaymentRisk } from '@/services/riskService';
import {
  buildMerchantCsv,
  cancelMerchantInvoice,
  createMerchantInvoice,
  loadMerchantInvoices,
  subscribeToMerchantInvoices,
  type MerchantInvoice,
} from '@/services/merchantService';
import { useWalletStore } from '@/store/walletStore';
import { formatCurrency, sanitizeDecimalInput, shortenAddress } from '@/utils/format';

function statusColor(status: MerchantInvoice['status']) {
  if (status === 'paid') return Colors.success;
  if (status === 'cancelled') return Colors.error;
  if (status === 'expired') return Colors.warning;
  return Colors.primary;
}

function TokenSelector({
  value,
  onChange,
}: {
  value: FxTokenSymbol;
  onChange: (next: FxTokenSymbol) => void;
}) {
  return (
    <View style={styles.tokenRow}>
      {getArcSupportedFxTokenSymbols().map((symbol) => (
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

function InvoiceRow({
  invoice,
  onOpen,
  onCancel,
}: {
  invoice: MerchantInvoice;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const accent = statusColor(invoice.status);

  return (
    <TouchableOpacity style={styles.invoiceRow} activeOpacity={0.85} onPress={onOpen}>
      <View style={[styles.invoiceStatusDot, { backgroundColor: accent }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.invoiceTopRow}>
          <Text style={styles.invoiceTitle}>{invoice.label}</Text>
          <View style={[styles.invoiceBadge, { backgroundColor: `${accent}18`, borderColor: `${accent}40` }]}>
            <Text style={[styles.invoiceBadgeText, { color: accent }]}>{invoice.status}</Text>
          </View>
        </View>
        <Text style={styles.invoiceMeta}>
          {invoice.amount} {invoice.tokenSymbol} · {formatCurrency(Number(invoice.displayAmount || 0), invoice.displayCurrency)}
        </Text>
        <Text style={styles.invoiceMeta}>
          {new Date(invoice.createdAt).toLocaleString()} · {invoice.settleMode}
        </Text>
      </View>
      {invoice.status === 'open' && (
        <TouchableOpacity style={styles.invoiceCancelBtn} onPress={onCancel}>
          <Ionicons name="close-outline" size={16} color={Colors.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function MerchantScreen() {
  const router = useRouter();
  const segments = useSegments();
  const inTab = segments[0] === '(tabs)';
  const { address } = useWalletStore();
  const [amount, setAmount] = useState('25');
  const [tokenSymbol, setTokenSymbol] = useState<FxTokenSymbol>('USDC');
  const [label, setLabel] = useState('T Pay Sale');
  const [note, setNote] = useState('Instant checkout on Arc');
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'VND'>('VND');
  const [displayAmount, setDisplayAmount] = useState('637500');
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<MerchantInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<MerchantInvoice | null>(null);

  const summary = useMemo(() => buildMerchantAnalytics(invoices), [invoices]);
  const backendIndexerEnabled = Boolean(process.env.EXPO_PUBLIC_TPAY_BACKEND_URL);
  const riskPreview = useMemo(() => assessPaymentRisk({
    operation: 'invoice_create',
    amount,
    tokenSymbol,
    merchantAddress: address,
    label,
  }), [amount, tokenSymbol, address, label]);

  useEffect(() => {
    const supported = getArcSupportedFxTokenSymbols();
    if (!supported.includes(tokenSymbol)) {
      setTokenSymbol(supported[0] ?? 'USDC');
    }
  }, [tokenSymbol]);

  useEffect(() => {
    const estimatedAmount = Number(amount || 0);
    if (!estimatedAmount) return;
    setDisplayAmount(displayCurrency === 'VND' ? String(Math.round(estimatedAmount * 25_500)) : estimatedAmount.toFixed(2));
  }, [amount, displayCurrency]);

  async function hydrate() {
    setLoading(true);
    try {
      const next = await loadMerchantInvoices({ merchantAddress: address ?? undefined, preferBackend: true });
      setInvoices(next);
      setSelectedInvoice((current) => next.find((invoice) => invoice.id === current?.id) ?? next[0] ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    hydrate();
  }, [address]);

  useEffect(() => {
    if (!address) return;

    const unsubscribe = subscribeToMerchantInvoices(address, (nextInvoices) => {
      setInvoices(nextInvoices);
      setSelectedInvoice((current) => nextInvoices.find((invoice) => invoice.id === current?.id) ?? nextInvoices[0] ?? null);
    });

    return unsubscribe;
  }, [address]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await hydrate();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreateInvoice() {
    if (!address) {
      Alert.alert('Wallet required', 'Please create or import a wallet before enabling merchant mode.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }
    if (!label.trim()) {
      Alert.alert('Missing label', 'Give this payment request a clear label.');
      return;
    }

    setCreating(true);
    try {
      const invoice = await createMerchantInvoice({
        merchantAddress: address,
        tokenSymbol,
        amount,
        label: label.trim(),
        note: note.trim(),
        displayCurrency,
        displayAmount,
        createOnchain: true,
      });

      await hydrate();
      setSelectedInvoice(invoice);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: 'Payment QR ready',
        text2: `${invoice.amount} ${invoice.tokenSymbol} can now be paid instantly.`,
      });
    } catch (err: any) {
      Alert.alert('Unable to create payment QR', err?.message ?? 'Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyLink() {
    if (!selectedInvoice) return;
    await Clipboard.setStringAsync(selectedInvoice.deepLink);
    Toast.show({ type: 'success', text1: 'Payment link copied', text2: selectedInvoice.deepLink });
  }

  async function handleShareLink() {
    if (!selectedInvoice) return;
    await Share.share({
      title: 'T Pay Payment Request',
      message: `${selectedInvoice.label}\n${selectedInvoice.deepLink}`,
    });
  }

  async function handleExportCsv() {
    const csv = buildMerchantCsv(invoices);
    await Share.share({ title: 'tpay-merchant-history.csv', message: csv });
  }

  async function handleCancel(invoice: MerchantInvoice) {
    try {
      await cancelMerchantInvoice(invoice.id);
      await hydrate();
      Toast.show({ type: 'success', text1: 'Payment request cancelled', text2: invoice.label });
    } catch (err: any) {
      Alert.alert('Unable to cancel payment request', err?.message ?? 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          {inTab ? <View style={styles.iconSpacer} /> : (
            <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text1} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Merchant QR</Text>
          <TouchableOpacity onPress={handleExportCsv} style={styles.iconBtn}>
            <Ionicons name="download-outline" size={20} color={Colors.text2} />
          </TouchableOpacity>
        </View>

        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>Payment request</Text>
              <Text style={styles.heroTitle}>Generate a dynamic QR for Arc Testnet asset payments.</Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="storefront-outline" size={26} color={Colors.primary} />
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{summary.openInvoices}</Text>
              <Text style={styles.summaryLabel}>Open requests</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{summary.paidInvoices}</Text>
              <Text style={styles.summaryLabel}>Paid</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{summary.successRate.toFixed(0)}%</Text>
              <Text style={styles.summaryLabel}>Success rate</Text>
            </View>
          </View>
          <Text style={styles.heroFootnote}>Gross settled: {formatMerchantVolume(summary)}</Text>
          <Text style={styles.heroFootnote}>Avg settlement: {formatSettlementDuration(summary.averageSettlementMs)} · Sync: {backendIndexerEnabled ? 'backend live' : 'local cache'}</Text>
          <Button label="Open Analytics" variant="secondary" onPress={() => router.push('/merchant-analytics' as any)} />
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>Generate payment QR</Text>
          <Input label="Amount" value={amount} onChangeText={(value) => setAmount(sanitizeDecimalInput(value, FX_TOKENS[tokenSymbol].decimals))} placeholder={tokenSymbol === 'cirBTC' ? '0.0001' : '0.00'} keyboardType="decimal-pad" />
          <TokenSelector value={tokenSymbol} onChange={setTokenSymbol} />
          <Input label="Payment note" value={label} onChangeText={setLabel} placeholder="T Pay Sale" />
          <Input label="Order details" value={note} onChangeText={setNote} placeholder="Instant checkout on Arc" />

          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Display Currency</Text>
              <View style={styles.currencyRow}>
                {(['VND', 'USD'] as const).map((currency) => (
                  <TouchableOpacity key={currency} style={[styles.currencyBtn, displayCurrency === currency && styles.currencyBtnActive]} onPress={() => setDisplayCurrency(currency)}>
                    <Text style={[styles.currencyBtnText, displayCurrency === currency && styles.currencyBtnTextActive]}>{currency}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ width: 14 }} />
            <View style={{ flex: 1 }}>
              <Input
                label="Display Amount"
                value={displayAmount}
                onChangeText={(value) => setDisplayAmount(value.replace(/[^0-9.]/g, ''))}
                placeholder={displayCurrency === 'VND' ? '637500' : '25.00'}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {riskPreview.warnings.length > 0 || !riskPreview.allowed ? (
            <Card style={!riskPreview.allowed ? styles.riskBlockedCard : styles.riskWarningCard}>
              <Ionicons name={!riskPreview.allowed ? 'ban-outline' : 'shield-checkmark-outline'} size={18} color={!riskPreview.allowed ? Colors.error : Colors.warning} />
              <Text style={!riskPreview.allowed ? styles.riskBlockedText : styles.riskWarningText}>
                {(!riskPreview.allowed ? riskPreview.reasons : riskPreview.warnings).join(' ')}
              </Text>
            </Card>
          ) : null}

          <Button
            label={creating ? 'Creating QR...' : 'Generate QR'}
            loading={creating}
            disabled={!riskPreview.allowed}
            onPress={handleCreateInvoice}
          />
        </Card>

        {loading && !selectedInvoice ? <Skeleton style={styles.qrSkeleton} /> : null}

        {selectedInvoice && (
          <Card style={styles.qrCard}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.sectionTitle}>{selectedInvoice.label}</Text>
                <Text style={styles.invoiceSub}>
                  {selectedInvoice.amount} {selectedInvoice.tokenSymbol} · {formatCurrency(Number(selectedInvoice.displayAmount || 0), selectedInvoice.displayCurrency)}
                </Text>
              </View>
              <View style={[styles.invoiceBadge, { backgroundColor: `${statusColor(selectedInvoice.status)}18`, borderColor: `${statusColor(selectedInvoice.status)}45` }]}>
                <Text style={[styles.invoiceBadgeText, { color: statusColor(selectedInvoice.status) }]}>{selectedInvoice.status}</Text>
              </View>
            </View>

            <View style={styles.qrWrap}>
              <QRCode value={selectedInvoice.qrValue} size={220} color={Colors.text1} backgroundColor={Colors.surface} />
            </View>

            <Text style={styles.qrMeta}>Merchant: {shortenAddress(selectedInvoice.merchantAddress, 6)}</Text>
            <Text style={styles.qrMeta}>Arc Testnet · {selectedInvoice.tokenSymbol}</Text>

                        <View style={styles.qrActions}>
              <Button label="Copy Link" variant="secondary" onPress={handleCopyLink} style={{ flex: 1 }} />
              <Button label="Share" variant="secondary" onPress={handleShareLink} style={{ flex: 1 }} />
            </View>
            <View style={styles.qrActions}>
              <Button label="QR mode" onPress={() => router.push({ pathname: '/merchant-pos' as any, params: { invoiceId: selectedInvoice.id } })} style={{ flex: 1 }} />
              <Button label="Payer View" variant="secondary" onPress={() => router.push({ pathname: '/pay' as any, params: { invoiceId: selectedInvoice.id } })} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        <Card style={styles.historyCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Payment requests</Text>
            <Text style={styles.historyHint}>Auto-refresh</Text>
          </View>

          {loading ? (
            <View style={styles.historySkeletonWrap}>
              {[0, 1, 2].map((item) => <Skeleton key={item} style={styles.historySkeleton} />)}
            </View>
          ) : invoices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={28} color={Colors.text3} />
              <Text style={styles.emptyTitle}>No payment requests yet</Text>
              <Text style={styles.emptySub}>Create your first QR payment request to start instant settlement.</Text>
            </View>
          ) : (
            invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onOpen={() => setSelectedInvoice(invoice)}
                onCancel={() => handleCancel(invoice)}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconSpacer: { width: 40, height: 40 },
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
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text1 },
  heroCard: { gap: 18, backgroundColor: '#10161F', borderColor: '#203244' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroTitle: { color: Colors.text1, fontSize: 22, fontWeight: '800', lineHeight: 28, maxWidth: '82%' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: '#21475A',
  },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  summaryValue: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  summaryLabel: { color: Colors.text3, fontSize: FontSize.xs },
  heroFootnote: { color: Colors.text2, fontSize: FontSize.sm },
  formCard: { gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: {
    color: Colors.text2,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  currencyRow: {
    flexDirection: 'row',
    backgroundColor: Colors.elevated,
    borderRadius: Radius.full,
    padding: 4,
    gap: 4,
    height: 46,
    alignItems: 'center',
  },
  currencyBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.full, alignItems: 'center' },
  currencyBtnActive: { backgroundColor: Colors.primary },
  currencyBtnText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '700' },
  currencyBtnTextActive: { color: Colors.bg },
  riskWarningCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningBg,
    borderColor: 'rgba(255,181,71,0.25)',
  },
  riskWarningText: { color: Colors.warning, fontSize: FontSize.sm, flex: 1, lineHeight: 19 },
  riskBlockedCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.errorBg,
    borderColor: 'rgba(255,77,106,0.28)',
  },
  riskBlockedText: { color: Colors.error, fontSize: FontSize.sm, flex: 1, lineHeight: 19 },  qrSkeleton: { height: 420, borderRadius: Radius.xl },
  qrCard: { gap: 12 },
  invoiceSub: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 4 },
  invoiceBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  invoiceBadgeText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  qrWrap: { alignItems: 'center', paddingVertical: 12 },
  qrMeta: { color: Colors.text3, fontSize: FontSize.xs },
  qrActions: { flexDirection: 'row', gap: 10 },
  historyCard: { gap: 8 },
  historyHint: { color: Colors.text3, fontSize: FontSize.xs },
  historySkeletonWrap: { gap: 10 },
  historySkeleton: { height: 72, borderRadius: Radius.lg },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  emptySub: { color: Colors.text2, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E1E2A',
  },
  invoiceStatusDot: { width: 10, height: 10, borderRadius: Radius.full },
  invoiceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  invoiceTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  invoiceMeta: { color: Colors.text3, fontSize: FontSize.xs },
  invoiceCancelBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.errorBg,
  },
});
















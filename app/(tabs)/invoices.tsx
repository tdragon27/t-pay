import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { UtilityBackButton } from '@/components/ui/UtilityBackButton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import {
  loadMerchantInvoices,
  type MerchantInvoice,
  type MerchantInvoiceStatus,
} from '@/services/merchantService';
import { buildMerchantAnalytics, formatMerchantVolume } from '@/services/merchantAnalyticsService';
import { useWalletStore } from '@/store/walletStore';
import { formatCurrency, shortenAddress } from '@/utils/format';

const FILTERS: Array<'all' | MerchantInvoiceStatus> = ['all', 'open', 'paid', 'expired', 'cancelled'];

function statusColor(status: MerchantInvoiceStatus) {
  if (status === 'paid') return Colors.success;
  if (status === 'cancelled') return Colors.error;
  if (status === 'expired') return Colors.warning;
  return Colors.primary;
}

function StatusBadge({ status }: { status: MerchantInvoiceStatus }) {
  const accent = statusColor(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${accent}18`, borderColor: `${accent}40` }]}>
      <Text style={[styles.statusBadgeText, { color: accent }]}>{status}</Text>
    </View>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </Card>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InvoiceRow({ invoice }: { invoice: MerchantInvoice }) {
  return (
    <TouchableOpacity
      style={styles.invoiceRow}
      activeOpacity={0.82}
      onPress={() => router.push({ pathname: '/pay' as any, params: { invoiceId: invoice.id } })}
    >
      <View style={styles.invoiceTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.invoiceTitle} numberOfLines={1}>{invoice.label}</Text>
          <Text style={styles.invoiceMeta} numberOfLines={1}>{shortenAddress(invoice.merchantAddress, 6)}</Text>
        </View>
        <StatusBadge status={invoice.status} />
      </View>

      <View style={styles.invoiceAmountRow}>
        <Text style={styles.invoiceAmount}>{invoice.amount} {invoice.tokenSymbol}</Text>
        <Text style={styles.invoiceLocal}>{formatCurrency(Number(invoice.displayAmount || 0), invoice.displayCurrency)}</Text>
      </View>

      <Text style={styles.invoiceMeta}>{new Date(invoice.createdAt).toLocaleString()}</Text>
    </TouchableOpacity>
  );
}

export default function PaymentRequestsScreen() {
  const address = useWalletStore((state) => state.address);
  const [invoices, setInvoices] = useState<MerchantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | MerchantInvoiceStatus>('all');

  const load = useCallback(async (refresh = false) => {
    if (!address) {
      setInvoices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const next = await loadMerchantInvoices({ merchantAddress: address, preferBackend: true });
      setInvoices(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const analytics = useMemo(() => buildMerchantAnalytics(invoices), [invoices]);
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => filter === 'all' || invoice.status === filter),
    [filter, invoices],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
      >
        <View style={styles.heroRow}>
          <UtilityBackButton />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>Payment Requests</Text>
            <Text style={styles.subtitle}>Merchant QR links, payment requests, and settlement history.</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/merchant')} activeOpacity={0.85}>
            <Ionicons name="add" size={24} color={Colors.bg} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Open" value={String(analytics.openInvoices)} accent={Colors.primary} />
          <StatCard label="Paid" value={String(analytics.paidInvoices)} accent={Colors.success} />
          <StatCard label="Success" value={`${analytics.successRate.toFixed(0)}%`} accent={Colors.warning} />
        </View>

        <Card style={styles.volumeCard}>
          <View style={styles.volumeIcon}>
            <Ionicons name="receipt-outline" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.volumeLabel}>Gross settled</Text>
            <Text style={styles.volumeValue}>{formatMerchantVolume(analytics)}</Text>
          </View>
        </Card>

        <View style={styles.filterRow}>
          {FILTERS.map((option) => (
            <FilterPill
              key={option}
              label={option === 'all' ? 'All' : option}
              active={filter === option}
              onPress={() => setFilter(option)}
            />
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading payment requests...</Text>
          </View>
        ) : filteredInvoices.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={30} color={Colors.text3} />
            <Text style={styles.emptyTitle}>No payment requests yet</Text>
            <Text style={styles.emptyText}>Create a payment request from Merchant QR. This screen uses the live merchant payment service.</Text>
            <Button label="Open Merchant QR" onPress={() => router.push('/merchant')} style={{ marginTop: 8 }} />
          </Card>
        ) : (
          filteredInvoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 112 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { color: Colors.text1, fontSize: FontSize.xxl, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, gap: 8, padding: 14 },
  statLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: FontSize.xl, fontWeight: '800' },
  volumeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#10161F', borderColor: '#203244' },
  volumeIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  volumeLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  volumeValue: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800', marginTop: 3 },
  filterRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primaryDim },
  pillText: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '700', textTransform: 'capitalize' },
  pillTextActive: { color: Colors.primary },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 12 },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm },
  emptyCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  emptyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  invoiceRow: { gap: 10, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, backgroundColor: Colors.surface },
  invoiceTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  invoiceTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  invoiceMeta: { color: Colors.text3, fontSize: FontSize.xs },
  invoiceAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  invoiceAmount: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  invoiceLocal: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase' },
});









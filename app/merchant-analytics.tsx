import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { buildMerchantAnalytics, formatMerchantVolume, formatSettlementDuration } from '@/services/merchantAnalyticsService';
import { buildMerchantCsv, loadMerchantInvoices, type MerchantInvoice } from '@/services/merchantService';
import { useWalletStore } from '@/store/walletStore';
import { formatCurrency, timeAgo } from '@/utils/format';

function Metric({ label, value, accent = Colors.text1 }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as any }]} />
      </View>
      <Text style={styles.barValue}>{formatCurrency(value, 'USD')}</Text>
    </View>
  );
}

export default function MerchantAnalyticsScreen() {
  const router = useRouter();
  const { address } = useWalletStore();
  const [invoices, setInvoices] = useState<MerchantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const analytics = useMemo(() => buildMerchantAnalytics(invoices), [invoices]);
  const maxDaily = Math.max(...analytics.dailyVolumes.map((item) => item.paidVolumeUsd), 0);

  async function hydrate(manual = false) {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await loadMerchantInvoices({ merchantAddress: address ?? undefined, preferBackend: true });
      setInvoices(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    hydrate();
  }, [address]);

  async function exportCsv() {
    await Share.share({ title: 'tpay-merchant-history.csv', message: buildMerchantCsv(invoices) });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Merchant Analytics</Text>
        <TouchableOpacity onPress={exportCsv} style={styles.iconBtn}>
          <Ionicons name="download-outline" size={20} color={Colors.text2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => hydrate(true)} tintColor={Colors.primary} />} showsVerticalScrollIndicator={false}>
        {loading ? (
          <>
            <Skeleton style={styles.heroSkeleton} />
            <Skeleton style={styles.cardSkeleton} />
          </>
        ) : (
          <>
            <Card style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Settlement dashboard</Text>
              <Text style={styles.heroValue}>{formatMerchantVolume(analytics)}</Text>
              <Text style={styles.heroSub}>Paid volume across {analytics.paidInvoices} completed invoices.</Text>
              <View style={styles.metricRow}>
                <Metric label="Success" value={`${analytics.successRate.toFixed(0)}%`} accent={Colors.success} />
                <Metric label="Open" value={String(analytics.openInvoices)} accent={Colors.primary} />
                <Metric label="Expired" value={String(analytics.expiredInvoices)} accent={Colors.warning} />
              </View>
            </Card>

            <Card style={styles.cardGap}>
              <Text style={styles.sectionTitle}>Settlement Speed</Text>
              <View style={styles.metricRow}>
                <Metric label="Average" value={formatSettlementDuration(analytics.averageSettlementMs)} />
                <Metric label="Median" value={formatSettlementDuration(analytics.medianSettlementMs)} />
                <Metric label="Fastest" value={formatSettlementDuration(analytics.fastestSettlementMs)} accent={Colors.success} />
              </View>
              <Text style={styles.noteText}>Arc finality is fast; measured time includes user action, wallet signing, and indexer sync.</Text>
            </Card>

            <Card style={styles.cardGap}>
              <Text style={styles.sectionTitle}>Daily Volume</Text>
              {analytics.dailyVolumes.length === 0 ? (
                <Text style={styles.noteText}>No paid invoice volume yet.</Text>
              ) : (
                analytics.dailyVolumes.map((item) => <Bar key={item.date} label={item.date.slice(5)} value={item.paidVolumeUsd} max={maxDaily} />)
              )}
            </Card>

            <Card style={styles.cardGap}>
              <Text style={styles.sectionTitle}>Token Mix</Text>
              {analytics.tokenVolumes.length === 0 ? (
                <Text style={styles.noteText}>No token volume yet.</Text>
              ) : (
                analytics.tokenVolumes.map((item) => (
                  <View key={item.token} style={styles.tokenRow}>
                    <View style={styles.tokenBadge}><Text style={styles.tokenBadgeText}>{item.token}</Text></View>
                    <Text style={styles.tokenText}>{item.amount.toFixed(4)} {item.token}</Text>
                    <Text style={styles.tokenUsd}>{formatCurrency(item.usdValue, 'USD')}</Text>
                  </View>
                ))
              )}
            </Card>

            <Card style={styles.cardGap}>
              <Text style={styles.sectionTitle}>Latest Activity</Text>
              <Text style={styles.noteText}>{analytics.latestPaidAt ? `Last payment ${timeAgo(analytics.latestPaidAt)}` : 'No paid invoice yet.'}</Text>
              <Button label="Open Merchant QR" onPress={() => router.push('/merchant' as any)} />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, paddingBottom: Spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  heroSkeleton: { height: 210, borderRadius: Radius.xl },
  cardSkeleton: { height: 160, borderRadius: Radius.xl },
  heroCard: { gap: 12, backgroundColor: '#10161F', borderColor: '#203244' },
  heroEyebrow: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroValue: { color: Colors.text1, fontSize: 26, lineHeight: 34, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricBox: { flex: 1, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 12, gap: 5 },
  metricValue: { fontSize: FontSize.md, fontWeight: '800' },
  metricLabel: { color: Colors.text3, fontSize: FontSize.xs },
  cardGap: { gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  noteText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: Colors.text2, fontSize: FontSize.xs, width: 42 },
  barTrack: { flex: 1, height: 10, borderRadius: Radius.full, backgroundColor: Colors.elevated, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  barValue: { color: Colors.text1, fontSize: FontSize.xs, width: 78, textAlign: 'right' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E2A' },
  tokenBadge: { width: 52, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primaryDim, alignItems: 'center' },
  tokenBadgeText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  tokenText: { color: Colors.text1, fontSize: FontSize.sm, flex: 1 },
  tokenUsd: { color: Colors.text2, fontSize: FontSize.sm },
});




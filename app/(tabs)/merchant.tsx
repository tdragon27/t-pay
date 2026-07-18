import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { MotionView } from '@/components/ui/MotionView';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '@/constants/theme';
import {
  loadMerchantInvoices,
  type MerchantInvoice,
} from '@/services/merchantService';
import { useWalletStore } from '@/store/walletStore';

type IconName = keyof typeof Ionicons.glyphMap;

interface BusinessTool {
  title: string;
  detail: string;
  icon: IconName;
  route: string;
  accent: string;
}

const FEATURED_TOOLS: BusinessTool[] = [
  {
    title: 'Payment QR',
    detail: 'Create a checkout request',
    icon: 'qr-code-outline',
    route: '/merchant',
    accent: Colors.primary,
  },
  {
    title: 'Batch payouts',
    detail: 'Pay multiple wallets',
    icon: 'layers-outline',
    route: '/batch-payout',
    accent: '#A99CFF',
  },
];

const BUSINESS_TOOLS: BusinessTool[] = [
  {
    title: 'POS',
    detail: 'Counter checkout',
    icon: 'phone-portrait-outline',
    route: '/merchant-pos',
    accent: '#59E0C5',
  },
  {
    title: 'Invoices',
    detail: 'Payment requests',
    icon: 'receipt-outline',
    route: '/(tabs)/invoices',
    accent: '#6FA8FF',
  },
  {
    title: 'Recurring',
    detail: 'Scheduled plans',
    icon: 'repeat-outline',
    route: '/(tabs)/recurring',
    accent: '#A99CFF',
  },
  {
    title: 'Analytics',
    detail: 'Payment insights',
    icon: 'bar-chart-outline',
    route: '/merchant-analytics',
    accent: Colors.primary,
  },
];

function Metric({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.metric}>
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Text style={styles.metricValue}>{value}</Text>
      )}
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FeaturedTool({ item }: { item: BusinessTool }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.featureHitbox}
      activeOpacity={0.74}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(item.route as any);
      }}
    >
      <LiquidGlassSurface
        tone="clear"
        intensity={42}
        style={styles.featureGlass}
        contentStyle={styles.featureContent}
      >
        <View style={[styles.featureIcon, { backgroundColor: `${item.accent}16` }]}>
          <Ionicons name={item.icon} size={22} color={item.accent} />
        </View>
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureDetail} numberOfLines={1}>{item.detail}</Text>
      </LiquidGlassSurface>
    </TouchableOpacity>
  );
}

function CompactTool({ item }: { item: BusinessTool }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.toolHitbox}
      activeOpacity={0.72}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push(item.route as any);
      }}
    >
      <LiquidGlassSurface
        tone="regular"
        intensity={34}
        style={styles.toolGlass}
        contentStyle={styles.toolContent}
      >
        <View style={[styles.toolIcon, { backgroundColor: `${item.accent}13` }]}>
          <Ionicons name={item.icon} size={18} color={item.accent} />
        </View>
        <View style={styles.toolCopy}>
          <Text style={styles.toolTitle}>{item.title}</Text>
          <Text style={styles.toolDetail}>{item.detail}</Text>
        </View>
      </LiquidGlassSurface>
    </TouchableOpacity>
  );
}

export default function BusinessHubScreen() {
  const address = useWalletStore((state) => state.address);
  const [invoices, setInvoices] = useState<MerchantInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void loadMerchantInvoices({
      merchantAddress: address ?? undefined,
      preferBackend: false,
    })
      .then((items) => {
        if (active) setInvoices(items);
      })
      .catch(() => {
        if (active) setInvoices([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [address]);

  const metrics = useMemo(() => {
    const owned = address
      ? invoices.filter(
          (invoice) =>
            invoice.merchantAddress.toLowerCase() === address.toLowerCase(),
        )
      : [];
    return {
      open: owned.filter((invoice) => invoice.status === 'open').length,
      paid: owned.filter((invoice) => invoice.status === 'paid').length,
      total: owned.length,
    };
  }, [address, invoices]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={['rgba(139,121,255,0.09)', 'rgba(7,9,13,0)']}
        style={styles.topWash}
        pointerEvents="none"
      />
      <View style={styles.backgroundOrb} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <MotionView variant="fade" style={styles.header}>
          <Text style={styles.kicker}>T PAY BUSINESS</Text>
          <Text style={styles.title}>Accept Payments</Text>
          <Text style={styles.subtitle}>QR checkout, invoices, and payouts on Arc.</Text>
        </MotionView>

        <MotionView delay={35}>
          <LinearGradient
            colors={['#25264A', '#19243C', '#111721']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={styles.summaryGlow} pointerEvents="none" />
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.summaryLabel}>Payment overview</Text>
                <Text style={styles.summaryTitle}>Arc Testnet</Text>
              </View>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Synced</Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Metric label="Open" value={String(metrics.open)} loading={loading} />
              <View style={styles.metricDivider} />
              <Metric label="Paid" value={String(metrics.paid)} loading={loading} />
              <View style={styles.metricDivider} />
              <Metric label="Total" value={String(metrics.total)} loading={loading} />
            </View>
          </LinearGradient>
        </MotionView>

        <MotionView delay={70}>
          <Text style={styles.sectionTitle}>Start</Text>
          <View style={styles.featureGrid}>
            {FEATURED_TOOLS.map((item) => (
              <FeaturedTool key={item.title} item={item} />
            ))}
          </View>
        </MotionView>

        <MotionView delay={110}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Manage</Text>
            <Text style={styles.sectionHint}>Testnet records</Text>
          </View>
          <View style={styles.toolsGrid}>
            {BUSINESS_TOOLS.map((item) => (
              <CompactTool key={item.title} item={item} />
            ))}
          </View>
        </MotionView>

        <View style={{ height: Platform.OS === 'ios' ? 104 : 88 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  backgroundOrb: {
    position: 'absolute',
    top: 180,
    left: -130,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'rgba(53,213,244,0.045)',
  },
  content: { paddingHorizontal: Spacing.md, paddingTop: 10 },
  header: { marginBottom: 18 },
  kicker: {
    color: '#AFA6FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  title: {
    color: Colors.text1,
    fontFamily: FontFamily.displayBold,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.75,
    marginTop: 2,
  },
  subtitle: { color: Colors.text2, fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 19, marginTop: 2 },
  summaryCard: {
    minHeight: 174,
    borderRadius: 28,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(184,174,255,0.15)',
    shadowColor: '#6D5CE7',
    shadowOpacity: 0.13,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  summaryGlow: {
    position: 'absolute',
    right: -45,
    top: -66,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(139,121,255,0.14)',
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  summaryLabel: { color: '#CDC9FF', fontSize: FontSize.sm, fontWeight: '600' },
  summaryTitle: { color: Colors.text1, fontSize: FontSize.xl, fontWeight: '600', marginTop: 5 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(7,9,13,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveText: { color: Colors.text2, fontSize: 10, fontWeight: '600' },
  metrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 23,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  metric: { flex: 1, alignItems: 'center', gap: 5 },
  metricValue: { color: Colors.text1, fontSize: 23, fontWeight: '600' },
  metricLabel: { color: Colors.text3, fontSize: FontSize.xs },
  metricDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  sectionTitle: {
    color: Colors.text1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.md,
    marginTop: 24,
    marginBottom: 11,
  },
  featureGrid: { flexDirection: 'row', gap: 10 },
  featureHitbox: { flex: 1, minWidth: 0, height: 124, borderRadius: 22 },
  featureGlass: { flex: 1, borderRadius: 22 },
  featureContent: { padding: 14, justifyContent: 'center' },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  featureTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600', marginTop: 10 },
  featureDetail: { color: Colors.text3, fontSize: 10.5, marginTop: 3 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionHint: { color: Colors.text3, fontSize: FontSize.xs, marginBottom: 12 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolHitbox: { width: '48.4%', height: 72, borderRadius: 19 },
  toolGlass: { flex: 1, borderRadius: 19 },
  toolContent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11 },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCopy: { flex: 1 },
  toolTitle: { color: Colors.text1, fontSize: FontSize.xs, fontWeight: '600' },
  toolDetail: { color: Colors.text3, fontSize: 10, marginTop: 3 },
});

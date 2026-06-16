import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { ARC_TESTNET_TOKENS, type SupportedArcTokenSymbol } from '@/constants/tokens';
import type { UnifiedActivityItem } from '@/services/activityService';
import type { ActivePaymentItem, ActivePaymentTone } from '@/utils/paymentDashboard';
import { shortenAddress, timeAgo } from '@/utils/format';
import { safeOpenTx } from '@/utils/safeOpenUrl';

type IconName = keyof typeof Ionicons.glyphMap;

const ACTIVITY_STYLE: Record<UnifiedActivityItem['type'], { icon: IconName; color: string; label: string }> = {
  send: { icon: 'arrow-up-circle-outline', color: '#6FA8FF', label: 'Sent' },
  receive: { icon: 'arrow-down-circle-outline', color: '#19E6FF', label: 'Received' },
  split_payment: { icon: 'people-outline', color: '#8B79FF', label: 'Split' },
  merchant_invoice: { icon: 'storefront-outline', color: '#6FA8FF', label: 'Invoice' },
  fx_swap: { icon: 'repeat-outline', color: '#8B79FF', label: 'Swap' },
  bridge: { icon: 'git-compare-outline', color: '#19E6FF', label: 'Bridge' },
  passport: { icon: 'sparkles-outline', color: '#A8B1FF', label: 'Passport' },
  request: { icon: 'receipt-outline', color: '#8EEBFF', label: 'Request' },
};

const STABLECOIN_RAILS: Array<{ symbol: SupportedArcTokenSymbol; target?: SupportedArcTokenSymbol; label: string; actionLabel: string; accent: string }> = [
  { symbol: 'USDC', target: 'EURC', label: 'Gas + payments', actionLabel: 'Open Swap', accent: ARC_TESTNET_TOKENS.USDC.accent },
  { symbol: 'EURC', target: 'USDC', label: 'Euro rail', actionLabel: 'Open Swap', accent: ARC_TESTNET_TOKENS.EURC.accent },
  { symbol: 'cirBTC', label: 'Bitcoin test asset', actionLabel: 'Receive', accent: ARC_TESTNET_TOKENS.cirBTC.accent },
];

function toneColor(tone: ActivePaymentTone) {
  if (tone === 'success') return '#19E6FF';
  if (tone === 'warning') return '#FFB547';
  if (tone === 'danger') return Colors.error;
  if (tone === 'muted') return Colors.text3;
  return '#8EEBFF';
}

function plainAmount(item: UnifiedActivityItem) {
  return `${item.amount ?? ''} ${item.token ?? 'USDC'}`.trim();
}

function activityTitle(item: UnifiedActivityItem) {
  const amount = plainAmount(item);
  if (item.type === 'send') return amount ? `Sent ${amount}` : 'Sent payment';
  if (item.type === 'receive') return amount ? `Received ${amount}` : 'Received payment';
  if (item.type === 'split_payment') {
    return item.direction === 'incoming'
      ? `Received ${amount || 'payment'} from split`
      : `Paid ${amount || 'split share'}`;
  }
  if (item.type === 'merchant_invoice') {
    return item.direction === 'incoming'
      ? `Received ${amount || 'invoice payment'}`
      : `Paid invoice ${amount || ''}`.trim();
  }
  if (item.type === 'fx_swap') return amount ? `Swapped ${amount}` : 'Swap completed';
  if (item.type === 'bridge') return amount ? `Bridged ${amount}` : 'Bridge activity';
  if (item.type === 'passport') return item.label || 'Passport update';
  return item.label || 'Payment request';
}

function activityContext(item: UnifiedActivityItem) {
  const address = item.counterparty?.startsWith('0x') ? shortenAddress(item.counterparty, 4) : item.counterparty;
  if (item.direction === 'outgoing' && address) return `To ${address}`;
  if (item.direction === 'incoming' && address) return `From ${address}`;
  if (item.note) return item.note;
  return item.sourceFeature === 'split' ? 'Split payment' : item.sourceFeature === 'merchant' ? 'Merchant payment' : item.label;
}

function ActivePaymentCard({ item }: { item: ActivePaymentItem }) {
  const router = useRouter();
  const chipColor = toneColor(item.tone);
  const progress = Math.max(0, Math.min(100, item.progressPercent ?? 0));

  const handlePress = () => {
    if (item.txHash) {
      void safeOpenTx(item.txHash);
      return;
    }
    if (item.route) router.push(item.route as any);
  };

  return (
    <TouchableOpacity style={styles.activeShadow} activeOpacity={0.82} onPress={handlePress}>
      <LinearGradient colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.028)']} style={styles.activeCard}>
        <View style={styles.cardGlow} />
        <View style={styles.activeHeader}>
          <View style={styles.activeTitleWrap}>
            <LinearGradient colors={[`${item.accent}24`, 'rgba(255,255,255,0.03)']} style={styles.activeIcon}>
              <Ionicons name={item.icon} size={18} color={item.accent} />
            </LinearGradient>
            <Text style={styles.activeTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: `${chipColor}15` }]}> 
            <Text style={[styles.chipText, { color: chipColor }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.activeAmount}>{item.amount}</Text>
        <Text style={styles.activeDetail} numberOfLines={2}>{item.detail}</Text>

        {item.progressPercent !== undefined ? (
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={[item.accent, '#8EEBFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress}%` }]}
            />
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.cardTimestamp}>{timeAgo(item.timestamp)}</Text>
          <View style={styles.ctaButton}>
            <Text style={styles.ctaText}>{item.ctaLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color="#8EEBFF" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function ActivityPreviewRow({ item }: { item: UnifiedActivityItem }) {
  const router = useRouter();
  const cfg = ACTIVITY_STYLE[item.type] ?? ACTIVITY_STYLE.request;
  const color = item.status === 'failed' ? Colors.error : item.status === 'pending' ? '#FFB547' : cfg.color;

  const open = () => {
    if (item.txHash) {
      void safeOpenTx(item.txHash);
      return;
    }
    router.push('/history' as any);
  };

  return (
    <TouchableOpacity style={styles.activityPreview} onPress={open} activeOpacity={0.78}>
      <LinearGradient colors={[`${color}20`, 'rgba(255,255,255,0.025)']} style={styles.activityIcon}>
        <Ionicons name={cfg.icon} size={18} color={color} />
      </LinearGradient>
      <View style={styles.activityMeta}>
        <Text style={styles.activityTitle} numberOfLines={1}>{activityTitle(item)}</Text>
        <Text style={styles.activitySub} numberOfLines={1}>{activityContext(item)}</Text>
        <Text style={styles.activityTime}>{timeAgo(item.timestamp)}</Text>
      </View>
      {item.status === 'pending' || item.status === 'failed' ? (
        <View style={[styles.smallStatus, { backgroundColor: `${color}16` }]}> 
          <Text style={[styles.smallStatusText, { color }]}>{item.status}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function ActivePaymentsSection({ items, loading, error }: { items: ActivePaymentItem[]; loading?: boolean; error?: string | null }) {
  const router = useRouter();

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Active Payments</Text>
          <Text style={styles.sectionSub}>Open splits, invoices, and pending sends</Text>
        </View>
        {loading ? <ActivityIndicator color={Colors.primary} /> : null}
      </View>

      {error ? (
        <LinearGradient colors={['rgba(255,181,71,0.10)', 'rgba(255,255,255,0.025)']} style={styles.noticeCard}>
          <Ionicons name="warning-outline" size={17} color="#FFB547" />
          <Text style={styles.noticeText}>{error}</Text>
        </LinearGradient>
      ) : null}

      {!loading && items.length === 0 ? (
        <LinearGradient colors={['rgba(25,230,255,0.085)', 'rgba(139,121,255,0.045)', 'rgba(255,255,255,0.025)']} style={styles.emptyCard}>
          <View style={styles.emptyVisualWrap}>
            <LinearGradient colors={['#19E6FF', '#2775CA']} style={styles.emptyCoin}>
              <Ionicons name="trail-sign-outline" size={22} color="#061018" />
            </LinearGradient>
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>No active payments</Text>
            <Text style={styles.emptyText}>Create a split bill, request assets, or send a payment.</Text>
          </View>
          <View style={styles.emptyActions}>
            <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/split-bill' as any)} activeOpacity={0.78}>
              <Text style={styles.emptyButtonText}>Create Split</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyButtonSecondary} onPress={() => router.push('/smart-qr' as any)} activeOpacity={0.78}>
              <Text style={styles.emptyButtonSecondaryText}>Request</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.cardStack}>
          {items.map((item) => <ActivePaymentCard key={item.id} item={item} />)}
        </View>
      )}
    </View>
  );
}

export function LatestActivityPreview({ items, loading }: { items: UnifiedActivityItem[]; loading?: boolean }) {
  const router = useRouter();
  const latest = items.slice(0, 1);

  return (
    <View style={styles.sectionBlockCompact}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest Activity</Text>
        <TouchableOpacity onPress={() => router.push('/history' as any)} activeOpacity={0.78}>
          <Text style={styles.viewAllText}>View full history</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)']} style={[styles.panelCard, styles.loadingCard]}>
          <ActivityIndicator color={Colors.primary} />
        </LinearGradient>
      ) : latest.length === 0 ? (
        <LinearGradient colors={['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.02)']} style={styles.panelCard}>
          <Text style={styles.emptyCompactTitle}>No activity yet</Text>
          <Text style={styles.emptyCompactText}>Your first payment will appear here.</Text>
        </LinearGradient>
      ) : (
        <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)']} style={styles.panelCard}>
          <ActivityPreviewRow item={latest[0]} />
        </LinearGradient>
      )}
    </View>
  );
}

function TokenRailCard({ rail, onPress }: { rail: (typeof STABLECOIN_RAILS)[number]; onPress: () => void }) {
  const token = ARC_TESTNET_TOKENS[rail.symbol];
  return (
    <TouchableOpacity style={styles.railShadow} activeOpacity={0.8} onPress={onPress}>
      <LinearGradient colors={[rail.accent + '16', 'rgba(255,255,255,0.025)']} style={styles.railCard}>
        <View style={[styles.railOrb, { backgroundColor: rail.accent + '24' }]} />
        <View style={[styles.railBadge, { backgroundColor: rail.accent + '18' }]}> 
          <Text style={[styles.railSymbol, { color: rail.accent }]}>{rail.symbol}</Text>
        </View>
        <Text style={styles.railLabel}>{rail.label}</Text>
        <Text style={styles.railName} numberOfLines={1}>{token.name}</Text>
        <View style={styles.railActionRow}>
          <Text style={styles.railActionText}>{rail.actionLabel}</Text>
          <Ionicons name={rail.target ? 'arrow-forward' : 'qr-code-outline'} size={13} color="#8EEBFF" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function StablecoinRailsSection() {
  const router = useRouter();

  function openRail(rail: (typeof STABLECOIN_RAILS)[number]) {
    if (!rail.target) {
      router.push({ pathname: '/receive' as any, params: { asset: rail.symbol } });
      return;
    }

    router.push({
      pathname: '/fx' as any,
      params: {
        fromSymbol: rail.symbol,
        toSymbol: rail.target,
      },
    });
  }

  return (
    <View style={styles.sectionBlockCompact}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Arc Assets</Text>
          <Text style={styles.sectionSub}>USDC, EURC, and cirBTC on Arc Testnet</Text>
        </View>
      </View>
      <View style={styles.railsRow}>
        {STABLECOIN_RAILS.map((rail) => (
          <TokenRailCard key={rail.symbol} rail={rail} onPress={() => openRail(rail)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: { marginTop: Spacing.md, marginBottom: 22 },
  sectionBlockCompact: { marginTop: 4, marginBottom: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 12 },
  sectionTitle: { color: '#F8FAFF', fontSize: FontSize.lg, fontWeight: '700', letterSpacing: -0.18 },
  sectionSub: { color: '#676B86', fontSize: FontSize.xs, marginTop: 3, maxWidth: 250, fontWeight: '700' },
  viewAllText: { color: '#8EEBFF', fontSize: FontSize.sm, fontWeight: '700' },
  cardStack: { gap: 12 },
  activeShadow: { borderRadius: 24, shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
  activeCard: { padding: Spacing.md, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.085)', overflow: 'hidden' },
  cardGlow: { position: 'absolute', right: -48, top: -48, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(25,230,255,0.08)' },
  activeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 12 },
  activeTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  activeTitle: { flex: 1, color: Colors.text1, fontSize: FontSize.md, fontWeight: '700', letterSpacing: -0.05 },
  chip: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase' },
  activeAmount: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.15 },
  activeDetail: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 18, marginTop: 4, fontWeight: '600' },
  progressTrack: { height: 6, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.075)', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: Radius.full },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: 14 },
  cardTimestamp: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '700' },
  ctaButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: 'rgba(25,230,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ctaText: { color: '#8EEBFF', fontSize: FontSize.xs, fontWeight: '700' },
  panelCard: { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)', overflow: 'hidden' },
  loadingCard: { minHeight: 76, alignItems: 'center', justifyContent: 'center' },
  activityPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  activityIcon: { width: 41, height: 41, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)' },
  activityMeta: { flex: 1, gap: 2 },
  activityTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700', letterSpacing: -0.05 },
  activitySub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 18, fontWeight: '600' },
  activityTime: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  smallStatus: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  smallStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)', marginBottom: Spacing.sm },
  noticeText: { flex: 1, color: Colors.text2, fontSize: FontSize.sm, lineHeight: 18 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  emptyVisualWrap: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyCoin: { width: 45, height: 45, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#00D4FF', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  emptyText: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17, marginTop: 3, fontWeight: '600' },
  emptyActions: { gap: 7, alignItems: 'stretch' },
  emptyButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: 'rgba(25,230,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  emptyButtonText: { color: '#8EEBFF', fontSize: FontSize.xs, fontWeight: '800', textAlign: 'center' },
  emptyButtonSecondary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  emptyButtonSecondaryText: { color: Colors.text1, fontSize: FontSize.xs, fontWeight: '800', textAlign: 'center' },
  emptyCompactTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700', paddingTop: Spacing.md, paddingHorizontal: Spacing.md },
  emptyCompactText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 19, paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: Spacing.md },
  railsRow: { flexDirection: 'row', gap: Spacing.sm },
  railShadow: { flex: 1, borderRadius: 19, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  railCard: { minHeight: 92, padding: 11, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)', justifyContent: 'space-between', overflow: 'hidden' },
  railOrb: { position: 'absolute', width: 64, height: 64, borderRadius: 32, right: -22, top: -20 },
  railBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  railSymbol: { fontSize: 11, fontWeight: '700' },
  railLabel: { color: Colors.text2, fontSize: 11, fontWeight: '700' },
  railName: { color: Colors.text3, fontSize: 10, lineHeight: 14, marginTop: 3, fontWeight: '600' },
  railActionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  railActionText: { color: Colors.text1, fontSize: FontSize.xs, fontWeight: '700' },
});



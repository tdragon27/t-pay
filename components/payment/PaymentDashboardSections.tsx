import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { PressScale } from '@/components/ui/PressScale';
import { Colors, FontFamily, FontSize, Radius } from '@/constants/theme';
import type { UnifiedActivityItem } from '@/services/activityService';
import type {
  ActivePaymentItem,
  ActivePaymentTone,
} from '@/utils/paymentDashboard';
import { shortenAddress, timeAgo } from '@/utils/format';
import { safeOpenTx } from '@/utils/safeOpenUrl';

type IconName = keyof typeof Ionicons.glyphMap;

const ACTIVITY_STYLE: Record<
  UnifiedActivityItem['type'],
  { icon: IconName; color: string; label: string }
> = {
  send: { icon: 'arrow-up-outline', color: '#6FA8FF', label: 'Sent' },
  receive: { icon: 'arrow-down-outline', color: Colors.success, label: 'Received' },
  split_payment: { icon: 'people-outline', color: '#8B79FF', label: 'Split' },
  merchant_invoice: { icon: 'storefront-outline', color: '#6FA8FF', label: 'Invoice' },
  fx_swap: { icon: 'swap-horizontal-outline', color: '#8B79FF', label: 'Swap' },
  bridge: { icon: 'git-compare-outline', color: Colors.primary, label: 'Bridge' },
  passport: { icon: 'sparkles-outline', color: '#A8B1FF', label: 'Passport' },
  request: { icon: 'receipt-outline', color: Colors.primary, label: 'Request' },
  batch: { icon: 'layers-outline', color: '#A8B1FF', label: 'Batch payout' },
};

function toneColor(tone: ActivePaymentTone) {
  if (tone === 'success') return Colors.success;
  if (tone === 'warning') return Colors.warning;
  if (tone === 'danger') return Colors.error;
  if (tone === 'muted') return Colors.text3;
  return Colors.primary;
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
  if (item.type === 'batch') return amount ? `Batch paid ${amount}` : 'Batch payout';
  return item.label || 'Payment request';
}

function activityContext(item: UnifiedActivityItem) {
  const address = item.counterparty?.startsWith('0x')
    ? shortenAddress(item.counterparty, 4)
    : item.counterparty;
  if (item.direction === 'outgoing' && address) return `To ${address}`;
  if (item.direction === 'incoming' && address) return `From ${address}`;
  if (item.note) return item.note;
  if (item.sourceFeature === 'split') return 'Split payment';
  if (item.sourceFeature === 'merchant') return 'Business payment';
  return item.label;
}

function SectionHeader({
  title,
  meta,
  action,
  onAction,
}: {
  title: string;
  meta?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionHeaderRight}>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
        {action && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.72} hitSlop={8}>
            <Text style={styles.sectionAction}>{action}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function ActivePaymentCard({ item }: { item: ActivePaymentItem }) {
  const router = useRouter();
  const statusColor = toneColor(item.tone);
  const progress = Math.max(0, Math.min(100, item.progressPercent ?? 0));

  const handlePress = () => {
    if (item.txHash) {
      void safeOpenTx(item.txHash);
      return;
    }
    if (item.route) router.push(item.route as any);
  };

  return (
    <PressScale
      style={styles.activeCardPress}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.amount}. ${item.status}`}
    >
      <View style={styles.activeCard}>
        <View style={[styles.activeAccent, { backgroundColor: item.accent }]} />
        <View style={styles.activeBody}>
          <View style={styles.activeHeader}>
            <View style={styles.activeTitleRow}>
              <View style={[styles.activeIcon, { backgroundColor: `${item.accent}12` }]}>
                <Ionicons name={item.icon} size={17} color={item.accent} />
              </View>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: `${statusColor}12` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {item.status}
              </Text>
            </View>
          </View>

          <View style={styles.activeContent}>
            <View style={styles.activeCopy}>
              <Text style={styles.activeAmount}>{item.amount}</Text>
              <Text style={styles.activeDetail} numberOfLines={1}>
                {item.detail}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
          </View>

          {item.progressPercent !== undefined ? (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: item.accent },
                ]}
              />
            </View>
          ) : null}

          <Text style={styles.timestamp}>{timeAgo(item.timestamp)}</Text>
        </View>
      </View>
    </PressScale>
  );
}

function ActivityPreviewRow({ item }: { item: UnifiedActivityItem }) {
  const router = useRouter();
  const config = ACTIVITY_STYLE[item.type] ?? ACTIVITY_STYLE.request;
  const color =
    item.status === 'failed'
      ? Colors.error
      : item.status === 'pending'
        ? Colors.warning
        : config.color;

  const open = () => {
    if (item.txHash) {
      void safeOpenTx(item.txHash);
      return;
    }
    router.push('/history' as any);
  };

  return (
    <PressScale
      style={styles.activityRowPress}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={activityTitle(item)}
    >
      <View style={styles.activityRow}>
        <View style={[styles.activityIcon, { backgroundColor: `${color}12` }]}>
          <Ionicons name={config.icon} size={18} color={color} />
        </View>
        <View style={styles.activityMeta}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {activityTitle(item)}
          </Text>
          <Text style={styles.activitySub} numberOfLines={1}>
            {activityContext(item)}
          </Text>
        </View>
        <View style={styles.activityRight}>
          <Text style={styles.activityTime}>{timeAgo(item.timestamp)}</Text>
          {item.status === 'pending' || item.status === 'failed' ? (
            <Text style={[styles.activityStatus, { color }]}>{item.status}</Text>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}

export function ActivePaymentsSection({
  items,
  loading,
  error,
}: {
  items: ActivePaymentItem[];
  loading?: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const pulseMeta = loading ? 'Syncing' : items.length > 0 ? `${items.length} active` : 'All clear';

  return (
    <View style={styles.section}>
      <SectionHeader title="Payment pulse" meta={pulseMeta} />

      {error ? (
        <View style={styles.inlineNotice}>
          <Ionicons name="warning-outline" size={17} color={Colors.warning} />
          <Text style={styles.inlineNoticeText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.skeletonCard} accessibilityLabel="Syncing payment status">
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyTop}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-done-outline" size={20} color={Colors.success} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Nothing waiting</Text>
              <Text style={styles.emptyText}>Request USDC or split a bill with friends.</Text>
            </View>
          </View>
          <View style={styles.emptyActions}>
            <PressScale
              style={styles.emptyAction}
              onPress={() => router.push('/smart-qr' as any)}
              accessibilityRole="button"
              accessibilityLabel="Request payment"
            >
              <View style={styles.emptyActionContent}>
                <Ionicons name="arrow-down-outline" size={15} color={Colors.primary} />
                <Text style={styles.emptyActionText}>Request</Text>
              </View>
            </PressScale>
            <PressScale
              style={styles.emptyAction}
              onPress={() => router.push('/split-bill' as any)}
              accessibilityRole="button"
              accessibilityLabel="Create split bill"
            >
              <View style={styles.emptyActionContent}>
                <Ionicons name="people-outline" size={15} color={Colors.primary} />
                <Text style={styles.emptyActionText}>Split</Text>
              </View>
            </PressScale>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {items.map((item) => (
            <ActivePaymentCard key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

export function LatestActivityPreview({
  items,
  loading,
}: {
  items: UnifiedActivityItem[];
  loading?: boolean;
}) {
  const router = useRouter();
  const latest = items.slice(0, 1);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Latest Activity"
        action="View all"
        onAction={() => router.push('/history' as any)}
      />

      {loading ? (
        <View style={styles.skeletonCard} accessibilityLabel="Loading activity">
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ) : latest.length === 0 ? (
        <View style={styles.activityEmpty}>
          <Ionicons name="receipt-outline" size={19} color={Colors.text3} />
          <Text style={styles.activityEmptyText}>
            Your first confirmed payment will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.activityPanel}>
          <ActivityPreviewRow item={latest[0]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: 'stretch',
    flexShrink: 0,
    minWidth: 0,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: {
    color: Colors.text1,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.displaySemiBold,
    letterSpacing: -0.2,
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bodySemiBold,
  },
  sectionMeta: {
    color: Colors.text3,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bodyMedium,
  },
  stack: { gap: 9 },
  activeCardPress: { alignSelf: 'stretch', borderRadius: Radius.lg },
  activeCard: {
    alignSelf: 'stretch',
    flexShrink: 0,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeAccent: { width: 3 },
  activeBody: { flex: 1, minWidth: 0, padding: 14 },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  activeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTitle: {
    flex: 1,
    color: Colors.text1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bodySemiBold,
  },
  statusChip: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 9.5,
    fontFamily: FontFamily.bodySemiBold,
    textTransform: 'uppercase',
  },
  activeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  activeCopy: { flex: 1 },
  activeAmount: {
    color: Colors.text1,
    fontSize: FontSize.md,
    fontFamily: FontFamily.displaySemiBold,
  },
  activeDetail: {
    color: Colors.text3,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.body,
    marginTop: 3,
  },
  progressTrack: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.elevated,
    overflow: 'hidden',
    marginTop: 11,
  },
  progressFill: { height: '100%', borderRadius: Radius.full },
  timestamp: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: 10, marginTop: 8 },
  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningBg,
    marginBottom: 9,
  },
  inlineNoticeText: {
    flex: 1,
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.body,
    lineHeight: 16,
  },
  skeletonCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  skeletonIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.elevated },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonTitle: { width: '46%', height: 9, borderRadius: 5, backgroundColor: Colors.elevated },
  skeletonLine: { width: '70%', height: 7, borderRadius: 4, backgroundColor: Colors.elevated },
  emptyCard: {
    minHeight: 112,
    padding: 13,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  emptyTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.successBg,
  },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  emptyText: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  emptyActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  emptyAction: {
    flex: 1,
    height: 38,
    borderRadius: Radius.full,
  },
  emptyActionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryGlow,
  },
  emptyActionText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bodySemiBold,
  },
  activityPanel: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activityRowPress: { borderRadius: Radius.lg },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityMeta: { flex: 1, minWidth: 0 },
  activityTitle: {
    color: Colors.text1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bodySemiBold,
  },
  activitySub: {
    color: Colors.text3,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.body,
    marginTop: 3,
  },
  activityRight: { alignItems: 'flex-end', gap: 3 },
  activityTime: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: 10 },
  activityStatus: {
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
    textTransform: 'uppercase',
  },
  activityEmpty: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  activityEmptyText: { flex: 1, color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.sm },
});



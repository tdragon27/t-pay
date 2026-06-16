import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { formatUsd } from '@/utils/format';

interface UnifiedBalanceReadyCardProps {
  arcUsdc: number;
  appKitConfigured: boolean;
  source?: 'APP_KIT_UNIFIED_BALANCE' | 'RPC_FALLBACK' | 'UNAVAILABLE';
  externalUsdc?: number;
  largestSourceName?: string;
  onBridge?: () => void;
  compact?: boolean;
}

function sourceLabel(source?: UnifiedBalanceReadyCardProps['source']) {
  if (source === 'APP_KIT_UNIFIED_BALANCE') return 'Unified Balance Kit connected';
  if (source === 'RPC_FALLBACK') return 'RPC fallback balance';
  return 'Arc balance only';
}

export function UnifiedBalanceReadyCard({
  arcUsdc,
  appKitConfigured,
  source,
  externalUsdc = 0,
  largestSourceName,
  onBridge,
  compact = false,
}: UnifiedBalanceReadyCardProps) {
  const hasExternal = externalUsdc > 0;
  const tone = !appKitConfigured ? Colors.warning : source === 'APP_KIT_UNIFIED_BALANCE' ? Colors.success : Colors.primary;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${tone}16`, borderColor: `${tone}35` }]}>
          <Ionicons name="layers-outline" size={18} color={tone} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Unified Balance Ready</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {appKitConfigured ? sourceLabel(source) : 'Unified Balance Kit not connected yet'}
          </Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: `${tone}14`, borderColor: `${tone}35` }]}>
          <Text style={[styles.statusText, { color: tone }]}>{appKitConfigured ? 'Ready' : 'Missing key'}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Arc USDC</Text>
          <Text style={styles.amountValue}>{formatUsd(arcUsdc)}</Text>
        </View>
        {hasExternal ? (
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>{largestSourceName ?? 'Other chains'}</Text>
            <Text style={styles.amountValue}>{formatUsd(externalUsdc)}</Text>
          </View>
        ) : null}
      </View>

      {hasExternal && onBridge ? (
        <TouchableOpacity style={styles.bridgeCta} onPress={onBridge} activeOpacity={0.78}>
          <Text style={styles.bridgeText}>Bridge to Arc</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      ) : (
        <Text style={styles.note}>
          {appKitConfigured
            ? 'No external USDC detected. T Pay will not invent multichain balances.'
            : 'Set EXPO_PUBLIC_CIRCLE_APP_KIT_KEY to enable Unified Balance Kit checks.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, borderRadius: 22, backgroundColor: 'rgba(18,18,26,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 13, marginBottom: Spacing.lg },
  cardCompact: { marginTop: 0, marginBottom: Spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerCopy: { flex: 1 },
  title: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  sub: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },
  statusChip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', gap: 10 },
  amountBox: { flex: 1, padding: 11, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  amountLabel: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  amountValue: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800', marginTop: 5 },
  bridgeCta: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)' },
  bridgeText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  note: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17 },
});



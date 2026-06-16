// app/insights.tsx
// -----------------------------------------------------------------------------
// Insights Dashboard ? testnet activity stats computed from real tx history.
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';

import { useWalletStore } from '@/store/walletStore';
import { useInsightsStore } from '@/store/insightsStore';
import { taskEngine } from '@/services/taskEngine';
import { useMultiChainBalance } from '@/hooks/useMultiChainBalance';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { formatTxDate } from '@/utils/format';

// --- Stat card ----------------------------------------------------------------

function StatCard({ icon, label, value, accent, delay }: {
  icon: keyof typeof Ionicons.glyphMap; label: string;
  value: string; accent: string; delay: number;
}) {
  const anim = useSharedValue(0);
  useEffect(() => { anim.value = withDelay(delay, withTiming(1, { duration: 500 })); }, []);
  const style = useAnimatedStyle(() => ({
    opacity:   anim.value,
    transform: [{ translateY: (1 - anim.value) * 16 }],
  }));

  return (
    <Animated.View style={[styles.statCard, style]}>
      <View style={[styles.statIcon, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// --- Activity Score ring ------------------------------------------------------

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? Colors.success : score >= 40 ? Colors.warning : Colors.error;
  return (
    <View style={styles.scoreWrap}>
      <LinearGradient
        colors={[color + '30', color + '08']}
        style={styles.scoreRing}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={styles.scoreMax}>/100</Text>
      </LinearGradient>
      <Text style={styles.scoreLabel}>Activity Score</Text>
    </View>
  );
}

// --- Chain balance row --------------------------------------------------------

function ChainRow({ logo, name, balance, error, isLoading }: {
  logo: string; name: string; balance: string; error: boolean; isLoading: boolean;
}) {
  return (
    <View style={styles.chainRow}>
      <Text style={styles.chainLogo}>{logo}</Text>
      <Text style={styles.chainName}>{name}</Text>
      {isLoading
        ? <ActivityIndicator size="small" color={Colors.text3} />
        : <Text style={[styles.chainBalance, error && { color: Colors.error }]}>
            {error ? 'Unavailable' : `$${balance} USDC`}
          </Text>
      }
    </View>
  );
}

// --- Main Screen --------------------------------------------------------------

export default function InsightsScreen() {
  const router   = useRouter();
  const { address, transactions, usdcBalanceFormatted } = useWalletStore();
  const insights = useInsightsStore();
  const { balances, totalUSD, isRefreshing, refresh } = useMultiChainBalance(address ?? null);
  const [flowHistory, setFlowHistory] = useState<Awaited<ReturnType<typeof taskEngine.getHistory>>>([]);

  // Compute insights from real data
  useEffect(() => {
    taskEngine.getHistory().then((flows) => {
      setFlowHistory(flows);
      insights.computeFromHistory(transactions, flows);
    });
  }, [transactions]);

  const totalBalance = parseFloat(usdcBalanceFormatted.replace(/,/g, '')) + totalUSD;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 4, right: 20 }}>
          <Ionicons name="close" size={24} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insights</Text>
        <TouchableOpacity
          onPress={refresh}
          style={styles.refreshBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
          disabled={isRefreshing}
        >
          {isRefreshing
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* -- Score + Total -------------------------------------------------- */}
        <LinearGradient colors={['#0C1628', '#0A1120', '#0A0A0F']} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.heroCardOrb} />
          <View style={styles.heroRow}>
            <ScoreRing score={insights.activityScore} />
            <View style={styles.heroStats}>
              <Text style={styles.heroLabel}>Total Volume (testnet)</Text>
              <Text style={styles.heroValue}>${insights.totalVolume.toFixed(2)}</Text>
              <Text style={[styles.heroLabel, { marginTop: 8 }]}>Streak</Text>
              <Text style={[styles.heroValue, { fontSize: FontSize.lg }]}>
                {insights.streakDays} day{insights.streakDays !== 1 ? 's' : ''} 
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* -- Stat grid ------------------------------------------------------ */}
        <View style={styles.statGrid}>
          <StatCard icon="swap-horizontal-outline" label="Total Txns"    value={String(insights.totalTxCount)} accent={Colors.primary} delay={0}   />
          <StatCard icon="arrow-up-outline"         label="Sent"         value={String(insights.sendCount)}    accent="#FF4D6A"        delay={80}  />
          <StatCard icon="arrow-down-outline"        label="Received"    value={String(insights.receiveCount)} accent={Colors.success} delay={160} />
          <StatCard icon="swap-horizontal-outline"  label="Bridges"      value={String(insights.bridgeCount)}  accent="#FFB547"        delay={240} />
          <StatCard icon="water-outline"            label="Faucet Claims" value={String(insights.faucetCount)}  accent="#8B79FF"        delay={320} />
          <StatCard icon="globe-outline"            label="Chains Used"  value={String(insights.chainsUsed.length)} accent="#00E88F"   delay={400} />
        </View>

        {/* -- Multi-chain balances ------------------------------------------- */}
        <Text style={styles.sectionTitle}>Balances Across Chains</Text>
        <View style={styles.card}>
          {/* Arc Testnet ? from walletStore */}
          <View style={[styles.chainRow, styles.chainRowBorder]}>
            <Text style={styles.chainLogo}>ARC</Text>
            <Text style={styles.chainName}>Arc Testnet</Text>
            <Text style={styles.chainBalance}>${usdcBalanceFormatted} USDC</Text>
          </View>
          {balances.map((b, i) => (
            <View key={b.chainId} style={i < balances.length - 1 ? styles.chainRowBorder : {}}>
              <ChainRow logo={b.logo} name={b.chainName} balance={b.balance} error={b.error} isLoading={b.isLoading} />
            </View>
          ))}
          {/* Total */}
          <View style={[styles.chainRow, styles.totalRow]}>
            <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
            <Text style={[styles.chainName, { color: Colors.text1 }]}>Total</Text>
            <Text style={[styles.chainBalance, { color: Colors.primary, fontSize: FontSize.md }]}>
              ${totalBalance.toFixed(2)} USDC
            </Text>
          </View>
        </View>

        {/* -- Recent flows --------------------------------------------------- */}
        {flowHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>AutoFlow History</Text>
            <View style={styles.card}>
              {flowHistory.slice(0, 5).map((flow, i) => {
                const successTasks = flow.tasks.filter((t) => t.status === 'success').length;
                const duration     = flow.endedAt ? flow.endedAt - flow.startedAt : null;
                return (
                  <View key={flow.id} style={[styles.flowRow, i < Math.min(flowHistory.length, 5) - 1 && styles.flowRowBorder]}>
                    <View style={[styles.flowStatus, { backgroundColor: flow.status === 'success' ? Colors.successBg : Colors.errorBg }]}>
                      <Ionicons
                        name={flow.status === 'success' ? 'checkmark' : 'close'}
                        size={13}
                        color={flow.status === 'success' ? Colors.success : Colors.error}
                      />
                    </View>
                    <View style={styles.flowMeta}>
                      <Text style={styles.flowName}>{flow.name}</Text>
                      <Text style={styles.flowDetail}>
                        {successTasks}/{flow.tasks.length} steps
                        {duration ? ` ? ${Math.round(duration / 1000)}s` : ''}
                      </Text>
                    </View>
                    <Text style={styles.flowTime}>{formatTxDate(Math.floor(flow.startedAt / 1000))}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* -- Last activity --------------------------------------------------- */}
        {insights.lastActivity > 0 && (
          <Text style={styles.lastActivity}>
            Last activity: {formatTxDate(insights.lastActivity)}
          </Text>
        )}

        <View style={{ height: Platform.OS === 'ios' ? 48 : 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn:{ padding: 8, width: 40 },
  headerTitle: { fontWeight: '700', fontSize: FontSize.lg, color: Colors.text1, flex: 1 },
  refreshBtn:  { padding: 8 },
  scroll:  { padding: Spacing.md },

  // Hero
  heroCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: '#1E2D40', overflow: 'hidden', position: 'relative' },
  heroCardOrb: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,212,255,0.06)' },
  heroRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },

  // Score ring
  scoreWrap:  { alignItems: 'center', gap: 8 },
  scoreRing:  { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  scoreNum:   { fontWeight: '700', fontSize: 28, letterSpacing: -1 },
  scoreMax:   { fontSize: FontSize.xs, color: Colors.text3 },
  scoreLabel: { fontSize: 11, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },

  heroStats:  { flex: 1, gap: 2 },
  heroLabel:  { fontSize: 11, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroValue:  { fontWeight: '700', fontSize: FontSize.xxl, color: Colors.text1, letterSpacing: -1 },

  // Stat grid
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.lg },
  statCard: {
    width: '30%', flexGrow: 1, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 6,
  },
  statIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontWeight: '700', fontSize: FontSize.xl, color: Colors.text1 },
  statLabel: { fontSize: 10, color: Colors.text3, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },

  // Section
  sectionTitle: { fontWeight: '700', fontSize: FontSize.md, color: Colors.text1, marginBottom: 10 },

  // Card
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.lg },

  // Chain rows
  chainRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 10 },
  chainRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  chainLogo: { fontSize: 20 },
  chainName: { flex: 1, fontWeight: '700', fontSize: FontSize.sm, color: Colors.text2 },
  chainBalance: { fontWeight: '700', fontSize: FontSize.sm, color: Colors.text1 },
  totalRow:  { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.elevated },

  // Flow rows
  flowRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  flowRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  flowStatus: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flowMeta:   { flex: 1, gap: 2 },
  flowName:   { fontWeight: '700', fontSize: FontSize.sm, color: Colors.text1 },
  flowDetail: { fontSize: FontSize.xs, color: Colors.text3 },
  flowTime:   { fontFamily: 'SpaceMono-Regular', fontSize: 10, color: Colors.text3 },

  lastActivity: { fontSize: FontSize.xs, color: Colors.text3, textAlign: 'center', marginBottom: 8 },
});


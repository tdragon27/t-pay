import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useBalance } from '@/hooks/useBalance';
import { useTransactions } from '@/hooks/useTransactions';
import { useArcHealth } from '@/hooks/useArcHealth';
import { usePaymentDashboard } from '@/hooks/usePaymentDashboard';
import { ActivePaymentsSection, LatestActivityPreview, StablecoinRailsSection } from '@/components/payment/PaymentDashboardSections';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useWalletStore } from '@/store/walletStore';
import { shortenAddress } from '@/utils/format';
import { copyWalletAddress } from '@/utils/copyWalletAddress';
import { SUPPORTED_ARC_TESTNET_TOKENS } from '@/constants/tokens';

type ActionRoute = '/send' | '/receive' | '/split-bill' | '/fx' | '/bridge' | '/merchant' | '/(tabs)/profile';

interface HomeAction {
  label: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: ActionRoute;
  accent: string;
  gradient: readonly [string, string];
}

const PRIMARY_ACTIONS: HomeAction[] = [
  { label: 'Send', helper: 'Transfer', icon: 'paper-plane-outline', route: '/send', accent: '#19E6FF', gradient: ['rgba(25,230,255,0.24)', 'rgba(39,117,202,0.10)'] },
  { label: 'Receive', helper: 'Smart QR', icon: 'qr-code-outline', route: '/receive', accent: '#6FA8FF', gradient: ['rgba(111,168,255,0.22)', 'rgba(39,117,202,0.09)'] },
  { label: 'Split', helper: 'Group pay', icon: 'people-outline', route: '/split-bill', accent: '#8B79FF', gradient: ['rgba(139,121,255,0.23)', 'rgba(39,117,202,0.08)'] },
  { label: 'Merchant QR', helper: 'Request', icon: 'storefront-outline', route: '/merchant', accent: '#2DE2C5', gradient: ['rgba(45,226,197,0.20)', 'rgba(39,117,202,0.08)'] },
];

const SECONDARY_ACTIONS: HomeAction[] = [
  { label: 'Swap', helper: '', icon: 'swap-horizontal-outline', route: '/fx', accent: '#8B79FF', gradient: ['rgba(139,121,255,0.16)', 'rgba(255,255,255,0.03)'] },
  { label: 'Bridge', helper: '', icon: 'git-compare-outline', route: '/bridge', accent: '#19E6FF', gradient: ['rgba(25,230,255,0.15)', 'rgba(255,255,255,0.03)'] },
  { label: 'Profile', helper: '', icon: 'person-circle-outline', route: '/(tabs)/profile', accent: '#A8B1FF', gradient: ['rgba(168,177,255,0.13)', 'rgba(255,255,255,0.03)'] },
];

function formatUsd(value: number, digits = 2) {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function GradientOrb({ style, colors }: { style?: StyleProp<ViewStyle>; colors: readonly [string, string] }) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0.15, y: 0.1 }}
      end={{ x: 0.85, y: 1 }}
      style={[styles.gradientOrb, style]}
    />
  );
}

function HeaderButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.headerButton} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.035)']} style={styles.headerButtonGradient}>
        <Ionicons name={icon} size={18} color={Colors.text1} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function ActionTile({ action, compact = false }: { action: HomeAction; compact?: boolean }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={compact ? styles.secondaryActionShadow : styles.actionShadow}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(action.route as any);
      }}
    >
      <LinearGradient
        colors={action.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={compact ? styles.secondaryActionTile : styles.actionTile}
      >
        <View style={[compact ? styles.secondaryActionIcon : styles.actionIcon, { shadowColor: action.accent }]}>
          <LinearGradient
            colors={[`${action.accent}32`, 'rgba(255,255,255,0.04)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={compact ? styles.secondaryActionIconGradient : styles.actionIconGradient}
          >
            <Ionicons name={action.icon} size={compact ? 17 : 22} color={action.accent} />
          </LinearGradient>
        </View>
        <View style={styles.actionCopy}>
          <Text style={compact ? styles.secondaryActionLabel : styles.actionLabel} numberOfLines={1}>{action.label}</Text>
          {!compact && <Text style={styles.actionHelper} numberOfLines={1}>{action.helper}</Text>}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function AssetsMiniCard({ tokenBalances, hidden }: { tokenBalances: ReturnType<typeof useWalletStore.getState>['tokenBalances']; hidden: boolean }) {
  return (
    <LinearGradient colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.028)']} style={styles.assetsCard}>
      <View style={styles.assetsHeader}>
        <View>
          <Text style={styles.assetsTitle}>Arc Assets</Text>
          <Text style={styles.assetsSub}>USDC, EURC, and cirBTC · Testnet only</Text>
        </View>
        <View style={styles.assetsBadge}>
          <Text style={styles.assetsBadgeText}>Testnet</Text>
        </View>
      </View>

      <View style={styles.assetRows}>
        {SUPPORTED_ARC_TESTNET_TOKENS.map((token) => {
          const balance = tokenBalances[token.symbol];
          const value = hidden ? '\u2022\u2022\u2022\u2022' : balance?.error ? '\u2014' : balance?.formatted ?? '0.00';
          return (
            <View key={token.symbol} style={styles.assetRow}>
              <LinearGradient colors={[token.accent + '2A', 'rgba(255,255,255,0.035)']} style={styles.assetIcon}>
                <Text style={[styles.assetIconText, { color: token.accent }]}>{token.iconLabel}</Text>
              </LinearGradient>
              <View style={styles.assetMeta}>
                <Text style={styles.assetSymbol}>{token.symbol}</Text>
                <Text style={styles.assetName} numberOfLines={1}>{token.name}</Text>
              </View>
              <View style={styles.assetBalanceWrap}>
                {balance?.isLoading ? <ActivityIndicator size="small" color={token.accent} /> : null}
                {!balance?.isLoading ? <Text style={styles.assetBalance}>{value}</Text> : null}
                {balance?.error ? <Text style={styles.assetError}>Unavailable</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    address,
    hideBalance,
    isBalanceLoading,
    setHideBalance,
    transactions,
    usdcBalanceFormatted,
  tokenBalances,
  } = useWalletStore();
  const { refetch: refetchBalance } = useBalance();
  const { refetch: refetchTransactions } = useTransactions();
  const { health, isChecking: healthChecking, refresh: refreshHealth } = useArcHealth();
  const dashboard = usePaymentDashboard({ address, transactions, activeLimit: 4, activityLimit: 1 });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [statusDismissed, setStatusDismissed] = useState(false);

  const usdcValue = Number(usdcBalanceFormatted.replace(/,/g, '')) || 0;
  const networkColor = health?.status === 'offline' ? Colors.error : health?.status === 'degraded' ? '#FFB547' : '#19E6FF';
  const networkLabel = healthChecking ? 'Checking Arc' : health?.status === 'offline' ? 'RPC offline' : health?.status === 'degraded' ? 'Arc slow' : 'Live on Arc';
  const statusStrip = useMemo(() => {
    if (!address) return { icon: 'wallet-outline' as const, label: 'Wallet setup needed', detail: 'Create or import a wallet' };
    if (usdcValue <= 0) return { icon: 'water-outline' as const, label: 'Faucet test assets needed', detail: 'Testnet only' };
    return { icon: 'checkmark-circle-outline' as const, label: 'Testnet assets ready', detail: 'Arc Testnet active' };
  }, [address, usdcValue]);

  const refreshAll = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refetchBalance(), refetchTransactions(), refreshHealth(), dashboard.refresh()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [dashboard.refresh, refetchBalance, refetchTransactions, refreshHealth]);

  async function copyAddress() {
    await copyWalletAddress(address);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.backgroundLayer} pointerEvents="none">
        <LinearGradient colors={['#05070D', '#090C17', '#05060B']} style={StyleSheet.absoluteFillObject} />
        <GradientOrb colors={['rgba(25,230,255,0.18)', 'rgba(25,230,255,0.00)']} style={styles.bgOrbTop} />
        <GradientOrb colors={['rgba(139,121,255,0.16)', 'rgba(139,121,255,0.00)']} style={styles.bgOrbBottom} />
        <View style={styles.bgPlaneOne} />
        <View style={styles.bgPlaneTwo} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={refreshAll}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ARC TESTNET</Text>
            <Text style={styles.title}>T Pay</Text>
            <Text style={styles.headerSubline}>Social stablecoin payments</Text>
          </View>
          <View style={styles.headerActions}>
            <HeaderButton icon="copy-outline" onPress={copyAddress} />
            <HeaderButton icon="settings-outline" onPress={() => router.push('/(tabs)/settings')} />
          </View>
        </View>

        <View style={styles.heroShadow}>
          <LinearGradient
            colors={['rgba(25,230,255,0.22)', 'rgba(39,117,202,0.18)', 'rgba(11,15,30,0.96)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroHighlight} />
            <View style={styles.heroRingOne} />
            <LinearGradient
              colors={['rgba(155,239,255,0.20)', 'rgba(39,117,202,0.08)', 'rgba(139,121,255,0.00)']}
              start={{ x: 0.15, y: 0.1 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.heroSoftOrb}
            />

            <TouchableOpacity style={styles.eyeButton} onPress={() => setHideBalance(!hideBalance)} activeOpacity={0.78}>
              <Ionicons name={hideBalance ? 'eye-off-outline' : 'eye-outline'} size={18} color="#DDEBFF" />
            </TouchableOpacity>

            <View style={styles.networkRow}>
              <TouchableOpacity style={[styles.livePill, { backgroundColor: `${networkColor}18` }]} onPress={refreshHealth} activeOpacity={0.78}>
                <View style={[styles.liveDot, { backgroundColor: networkColor }]} />
                <Text style={[styles.liveText, { color: networkColor }]}>{networkLabel}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.balanceLabel}>Arc Assets</Text>
            {isBalanceLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.balanceLoader} />
            ) : (
              <Text style={styles.balanceText}>{hideBalance ? '$ ****' : formatUsd(usdcValue)}</Text>
            )}

            <View style={styles.balanceFooter}>
              <TouchableOpacity style={styles.addressPill} onPress={copyAddress} activeOpacity={0.78}>
                <Ionicons name="wallet-outline" size={14} color="#8EEBFF" />
                <Text style={styles.addressText}>{address ? shortenAddress(address, 6) : 'No wallet'}</Text>
              </TouchableOpacity>
              <View style={styles.gasPill}>
                <Text style={styles.gasText}>Testnet assets only</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {!statusDismissed ? (
          <LinearGradient colors={['rgba(25,230,255,0.095)', 'rgba(139,121,255,0.055)']} style={styles.statusStrip}>
            <View style={styles.statusLeft}>
              <View style={styles.statusIconBubble}>
                <Ionicons name={statusStrip.icon} size={15} color="#8EEBFF" />
              </View>
              <Text style={styles.statusLabel}>{statusStrip.label}</Text>
              <Text style={styles.statusDetail}>{statusStrip.detail}</Text>
            </View>
            <TouchableOpacity onPress={() => setStatusDismissed(true)} hitSlop={10}>
              <Ionicons name="close" size={16} color={Colors.text3} />
            </TouchableOpacity>
          </LinearGradient>
        ) : null}


        <AssetsMiniCard tokenBalances={tokenBalances} hidden={hideBalance} />

        <View style={styles.actionGrid}>
          {PRIMARY_ACTIONS.map((action) => (
            <ActionTile key={action.label} action={action} />
          ))}
        </View>

        <View style={styles.secondaryActionGrid}>
          {SECONDARY_ACTIONS.map((action) => (
            <ActionTile key={action.label} action={action} compact />
          ))}
        </View>

        <View style={styles.inlineCtaRow}>
          <TouchableOpacity style={styles.inlineCta} onPress={() => router.push('/faucet')} activeOpacity={0.78}>
            <Ionicons name="water-outline" size={17} color="#A8B1FF" />
            <Text style={[styles.inlineCtaText, { color: '#C6CBFF' }]}>Need test assets?</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inlineCta} onPress={() => router.push('/scan')} activeOpacity={0.78}>
            <Ionicons name="scan-outline" size={17} color="#8EEBFF" />
            <Text style={styles.inlineCtaText}>Scan payment QR</Text>
          </TouchableOpacity>
        </View>

        <ActivePaymentsSection items={dashboard.activePayments} loading={dashboard.isLoading} error={dashboard.error} />
        <LatestActivityPreview items={dashboard.latestActivity} loading={dashboard.isLoading} />
        <StablecoinRailsSection />

        <View style={{ height: Platform.OS === 'ios' ? 112 : 94 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#05070D' },
  backgroundLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  gradientOrb: { position: 'absolute', borderRadius: 999 },
  bgOrbTop: { top: -128, right: -92, width: 300, height: 300 },
  bgOrbBottom: { bottom: 120, left: -172, width: 360, height: 360 },
  bgPlaneOne: { position: 'absolute', top: 128, right: -70, width: 170, height: 260, borderRadius: 44, transform: [{ rotate: '-22deg' }], backgroundColor: 'rgba(255,255,255,0.025)' },
  bgPlaneTwo: { position: 'absolute', top: 410, left: -80, width: 160, height: 220, borderRadius: 40, transform: [{ rotate: '18deg' }], backgroundColor: 'rgba(25,230,255,0.035)' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  kicker: { color: '#8EEBFF', fontSize: 11, fontWeight: '700', letterSpacing: 1.45, textTransform: 'uppercase' },
  title: { color: '#F8FAFF', fontSize: 31, lineHeight: 35, fontWeight: '700', letterSpacing: -0.55 },
  headerSubline: { color: '#676B86', fontSize: FontSize.xs, fontWeight: '700', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerButton: { width: 43, height: 43, borderRadius: 17, overflow: 'hidden', shadowColor: '#00D4FF', shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  headerButtonGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  heroShadow: { borderRadius: 34, marginBottom: 13, shadowColor: '#00D4FF', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  heroCard: { minHeight: 226, borderRadius: 34, padding: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroHighlight: { position: 'absolute', top: 1, left: 24, right: 24, height: 1, backgroundColor: 'rgba(255,255,255,0.34)' },
  heroRingOne: { position: 'absolute', width: 224, height: 224, borderRadius: 112, right: -102, top: -74, borderWidth: 38, borderColor: 'rgba(25,230,255,0.055)' },
  heroSoftOrb: { position: 'absolute', right: -34, top: 34, width: 156, height: 156, borderRadius: 78, opacity: 0.92 },
  networkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 30, paddingRight: 54 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.25 },
  eyeButton: { position: 'absolute', top: 18, right: 18, zIndex: 3, width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,13,27,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  balanceLabel: { color: 'rgba(238,244,255,0.72)', fontSize: FontSize.sm, fontWeight: '800', letterSpacing: 0.1 },
  balanceLoader: { alignSelf: 'flex-start', marginTop: Spacing.sm, marginBottom: Spacing.md },
  balanceText: { color: Colors.white, fontSize: 47, lineHeight: 55, fontWeight: '800', letterSpacing: -1.8, marginTop: 2 },
  balanceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, gap: Spacing.sm },
  addressPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: 'rgba(4,7,14,0.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  addressText: { color: '#F3F7FF', fontSize: FontSize.xs, fontFamily: 'SpaceMono-Regular' },
  gasPill: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  gasText: { color: '#BCEFFF', fontSize: FontSize.xs, fontWeight: '700' },
  statusStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },
  statusLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusIconBubble: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  statusLabel: { color: Colors.text1, fontSize: FontSize.xs, fontWeight: '700' },
  statusDetail: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '700' },
  assetsCard: { padding: 14, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16, overflow: 'hidden' },
  assetsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 12 },
  assetsTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700', letterSpacing: -0.1 },
  assetsSub: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17, marginTop: 2, fontWeight: '600' },
  assetsBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: 'rgba(25,230,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  assetsBadgeText: { color: '#8EEBFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase' },
  assetRows: { gap: 10 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  assetIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  assetIconText: { fontSize: 13, fontWeight: '800' },
  assetMeta: { flex: 1 },
  assetSymbol: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  assetName: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  assetBalanceWrap: { minWidth: 98, alignItems: 'flex-end' },
  assetBalance: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  assetError: { color: Colors.error, fontSize: 10, marginTop: 2, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: 12 },
  actionShadow: { flex: 1, minWidth: '47%', borderRadius: 24, shadowColor: '#00D4FF', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  actionTile: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 12, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  actionIcon: { width: 48, height: 48, borderRadius: 17, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  actionIconGradient: { flex: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  actionCopy: { alignItems: 'center' },
  actionLabel: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center', letterSpacing: -0.1 },
  actionHelper: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 3, textAlign: 'center', fontWeight: '700' },
  secondaryActionGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 15 },
  secondaryActionShadow: { flex: 1, borderRadius: 19, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  secondaryActionTile: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 9, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)' },
  secondaryActionIcon: { width: 33, height: 33, borderRadius: 13, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  secondaryActionIconGradient: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  secondaryActionLabel: { color: Colors.text1, fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center' },
  inlineCtaRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 24 },
  inlineCta: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  inlineCtaText: { color: '#8EEBFF', fontSize: FontSize.sm, fontWeight: '700' },
});




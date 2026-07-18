import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ActivePaymentsSection, LatestActivityPreview } from '@/components/payment/PaymentDashboardSections';
import { RecentPeopleSection } from '@/components/payment/RecentPeopleSection';
import { TpayMark } from '@/components/brand/TpayMark';
import { AnimatedBalanceText } from '@/components/ui/AnimatedBalanceText';
import { AnimatedGlassBorder } from '@/components/ui/AnimatedGlassBorder';
import { PressScale } from '@/components/ui/PressScale';
import { StatusPulse } from '@/components/ui/StatusPulse';
import { ActionColors, Colors, FontFamily, FontSize, Spacing } from '@/constants/theme';
import { SUPPORTED_ARC_TESTNET_TOKENS } from '@/constants/tokens';
import { useArcHealth } from '@/hooks/useArcHealth';
import { useBalance } from '@/hooks/useBalance';
import { usePaymentDashboard } from '@/hooks/usePaymentDashboard';
import { useTransactions } from '@/hooks/useTransactions';
import { useWalletStore } from '@/store/walletStore';
import { copyWalletAddress } from '@/utils/copyWalletAddress';
import { shortenAddress, timeAgo } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;

interface HomeAction {
  label: string;
  icon: IconName;
  route: string;
  accent: string;
}

const HOME_BORDER = 'rgba(225,247,255,0.09)';
const HOME_SURFACE = '#0D141D';
const HOME_RADIUS = 22;
const HOME_DEPTH = {
  shadowColor: '#000000',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;

const PRIMARY_ACTIONS: HomeAction[] = [
  { label: 'Pay', icon: 'arrow-up-outline', route: '/send', accent: ActionColors.pay },
  { label: 'Request', icon: 'arrow-down-outline', route: '/smart-qr', accent: ActionColors.request },
  { label: 'Split', icon: 'people-outline', route: '/split-bill', accent: ActionColors.split },
  { label: 'Swap', icon: 'swap-horizontal-outline', route: '/fx', accent: ActionColors.swap },
];

function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressScale
      style={styles.headerButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.headerButtonContent}>
        <Ionicons name={icon} size={19} color={Colors.text1} />
      </View>
    </PressScale>
  );
}

function MainAction({ action }: { action: HomeAction }) {
  const router = useRouter();

  return (
    <PressScale
      style={styles.mainAction}
      onPress={() => router.push(action.route as any)}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={styles.mainActionContent}>
        <View
          style={[
            styles.mainActionIcon,
            { backgroundColor: `${action.accent}12`, borderColor: `${action.accent}32` },
          ]}
        >
          <Ionicons name={action.icon} size={22} color={action.accent} />
        </View>
        <Text style={styles.mainActionLabel}>{action.label}</Text>
      </View>
    </PressScale>
  );
}

function AssetList({
  balances,
  hidden,
}: {
  balances: ReturnType<typeof useWalletStore.getState>['tokenBalances'];
  hidden: boolean;
}) {
  return (
    <View style={styles.assetsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Assets</Text>
        <Text style={styles.sectionContext}>ARC TESTNET</Text>
      </View>
      <View style={styles.assetList}>
        <AnimatedGlassBorder
          borderRadius={HOME_RADIUS}
          duration={11500}
          enabled
          intensity="subtle"
        />
        {SUPPORTED_ARC_TESTNET_TOKENS.map((token, index) => {
          const state = balances[token.symbol];
          const value = hidden
            ? '••••'
            : state?.error
              ? '—'
              : state?.isLoading
                ? '…'
                : state?.formatted ?? '0';
          const subtitle = token.symbol === 'USDC'
            ? 'USD Coin'
            : token.symbol === 'EURC'
              ? 'Euro Coin'
              : token.name;

          return (
            <View key={token.symbol} style={[styles.assetRow, index > 0 && styles.assetRowDivider]}>
              <View style={[styles.assetIcon, { backgroundColor: `${token.accent}12` }]}>
                <Text style={[styles.assetIconText, { color: token.accent }]}>{token.iconLabel}</Text>
              </View>
              <View style={styles.assetIdentity}>
                <Text style={styles.assetSymbol}>{token.symbol}</Text>
                <Text style={styles.assetName} numberOfLines={1}>{subtitle}</Text>
              </View>
              <Text style={styles.assetValue} numberOfLines={1}>{value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const homeBottomPadding = bottomTabBarHeight + insets.bottom + 16;
  const {
    address,
    hideBalance,
    isBalanceLoading,
    setHideBalance,
    tokenBalances,
    transactions,
    usdcBalanceFormatted,
  } = useWalletStore();
  const { refetch: refetchBalance } = useBalance();
  const { refetch: refetchTransactions } = useTransactions();
  const { health, isChecking: healthChecking, refresh: refreshHealth } = useArcHealth();
  const dashboard = usePaymentDashboard({
    address,
    transactions,
    activeLimit: 3,
    activityLimit: 1,
  });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const usdcValue = Number(usdcBalanceFormatted.replace(/,/g, '')) || 0;
  const networkColor = health?.status === 'offline'
    ? Colors.error
    : health?.status === 'degraded'
      ? Colors.warning
      : Colors.success;
  const networkLabel = healthChecking
    ? 'Checking'
    : health?.status === 'offline'
      ? 'Offline'
      : health?.status === 'degraded'
        ? 'Degraded'
        : 'Arc Testnet';
  const balanceUpdatedAt = tokenBalances.USDC?.updatedAt;
  const balanceSyncLabel = isBalanceLoading
    ? 'Refreshing'
    : balanceUpdatedAt
      ? `Updated ${timeAgo(balanceUpdatedAt)}`
      : 'Not synced yet';

  const notice = useMemo(() => {
    if (!address) {
      return {
        icon: 'wallet-outline' as const,
        title: 'Wallet setup needed',
        detail: 'Create or import a wallet to start.',
        route: '/(onboarding)/welcome',
      };
    }
    if (health?.status === 'offline') {
      return {
        icon: 'cloud-offline-outline' as const,
        title: 'Using cached data',
        detail: 'Arc RPC is temporarily unavailable.',
        route: '/developer-debug',
      };
    }
    if (usdcValue <= 0) {
      return {
        icon: 'water-outline' as const,
        title: 'Need test assets?',
        detail: 'Open the Arc Testnet faucet.',
        route: '/faucet',
      };
    }
    return null;
  }, [address, health?.status, usdcValue]);

  const refreshAll = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([
        refetchBalance(),
        refetchTransactions(),
        refreshHealth(),
        dashboard.refresh(),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  }, [dashboard.refresh, refetchBalance, refetchTransactions, refreshHealth]);

  async function copyAddress() {
    await copyWalletAddress(address);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: homeBottomPadding }}
        contentContainerStyle={[styles.scroll, { paddingBottom: homeBottomPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={refreshAll}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.contentShell}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.accountHeader}
              activeOpacity={0.72}
              onPress={() => router.push('/(tabs)/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open wallet settings"
            >
              <TpayMark size={38} />
              <View style={styles.accountCopy}>
                <Text style={styles.accountName}>T Pay</Text>
                <View style={styles.accountMeta}>
                  <StatusPulse color={networkColor} />
                  <Text style={styles.accountMetaText} numberOfLines={1}>
                    {address ? shortenAddress(address, 5) : networkLabel}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <HeaderButton icon="scan-outline" label="Scan payment QR" onPress={() => router.push('/scan')} />
              <HeaderButton icon="copy-outline" label="Copy wallet address" onPress={copyAddress} />
            </View>
          </View>

          <LinearGradient
            colors={['#112A38', '#101C29']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <View style={styles.cardHighlight} pointerEvents="none" />
            <AnimatedGlassBorder
              borderRadius={24}
              duration={8000}
              enabled
              intensity="hero"
            />
            <View style={styles.balanceHeader}>
              <View style={styles.balanceCopy}>
                <Text style={styles.balanceLabel}>Arc balance</Text>
                <Text style={styles.balanceSupporting}>USDC for payments and network fees</Text>
              </View>
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setHideBalance(!hideBalance)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={hideBalance ? 'Show balances' : 'Hide balances'}
              >
                <Ionicons
                  name={hideBalance ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color={Colors.text2}
                />
              </TouchableOpacity>
            </View>
            {isBalanceLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.balanceLoader} />
            ) : (
              <AnimatedBalanceText value={usdcValue} hidden={hideBalance} style={styles.balanceText} />
            )}
            <View style={styles.balanceStatusRow}>
              <StatusPulse color={networkColor} />
              <Text style={styles.balanceStatusText}>{networkLabel}</Text>
              <View style={styles.balanceStatusDivider} />
              <Text style={styles.balanceStatusText}>{balanceSyncLabel}</Text>
            </View>
          </LinearGradient>

          <View style={styles.mainActions}>
            {PRIMARY_ACTIONS.map((action) => <MainAction key={action.label} action={action} />)}
          </View>

          <RecentPeopleSection activityItems={dashboard.activityItems} />

          <AssetList balances={tokenBalances} hidden={hideBalance} />

          {notice && !noticeDismissed ? (
            <View style={styles.noticeRow}>
              <AnimatedGlassBorder
                borderRadius={18}
                duration={12500}
                enabled
                intensity="subtle"
              />
              <PressScale
                style={styles.noticeAction}
                onPress={() => router.push(notice.route as any)}
                accessibilityRole="button"
                accessibilityLabel={`${notice.title}. ${notice.detail}`}
              >
                <View style={styles.noticeContent}>
                  <View style={styles.noticeIcon}>
                    <Ionicons name={notice.icon} size={17} color={Colors.warning} />
                  </View>
                  <View style={styles.noticeCopy}>
                    <Text style={styles.noticeTitle}>{notice.title}</Text>
                    <Text style={styles.noticeDetail}>{notice.detail}</Text>
                  </View>
                </View>
              </PressScale>
              <TouchableOpacity
                style={styles.noticeDismiss}
                onPress={() => setNoticeDismissed(true)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notice"
              >
                <Ionicons name="close" size={17} color={Colors.text3} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.flowSection}>
            <ActivePaymentsSection
              items={dashboard.activePayments}
              loading={dashboard.isLoading}
              error={dashboard.error}
            />
          </View>

          <View style={styles.flowSection}>
            <LatestActivityPreview
              items={dashboard.latestActivity}
              loading={dashboard.isLoading}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingTop: 12 },
  contentShell: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  accountHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: {
    color: Colors.text1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.md,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  accountMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3, minWidth: 0 },
  accountMetaText: {
    flex: 1,
    color: Colors.text3,
    fontFamily: FontFamily.body,
    fontSize: 10.5,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { width: 44, height: 44, borderRadius: 14 },
  headerButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: HOME_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_BORDER,
  },
  balanceCard: {
    minHeight: 158,
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_BORDER,
    ...HOME_DEPTH,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  balanceCopy: { flex: 1, paddingRight: 12 },
  balanceLabel: {
    color: '#D7E0E9',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
  },
  balanceSupporting: {
    color: '#7F8B9B',
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 4,
  },
  eyeButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,10,15,0.24)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_BORDER,
  },
  balanceLoader: { alignSelf: 'flex-start', marginTop: 25 },
  balanceText: {
    color: Colors.white,
    fontFamily: FontFamily.displayBold,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -1.7,
    marginTop: 17,
  },
  balanceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    minHeight: 16,
  },
  balanceStatusText: {
    color: '#8390A1',
    fontFamily: FontFamily.body,
    fontSize: 10.5,
  },
  balanceStatusDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 7,
    backgroundColor: '#536071',
  },
  mainActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 18,
  },
  mainAction: {
    flex: 1,
    minWidth: 0,
    height: 78,
    borderRadius: 18,
  },
  mainActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  mainActionLabel: {
    color: Colors.text1,
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    marginTop: 7,
  },
  assetsSection: { marginTop: 26 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: Colors.text1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  sectionContext: {
    color: Colors.text3,
    fontFamily: FontFamily.mono,
    fontSize: 9.5,
    letterSpacing: 0.7,
  },
  assetList: {
    borderRadius: HOME_RADIUS,
    paddingHorizontal: 15,
    backgroundColor: HOME_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_BORDER,
  },
  assetRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assetRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.055)',
  },
  assetIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconText: { fontFamily: FontFamily.displayBold, fontSize: 12 },
  assetIdentity: { flex: 1, minWidth: 0 },
  assetSymbol: {
    color: Colors.text1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
  },
  assetName: {
    color: Colors.text3,
    fontFamily: FontFamily.body,
    fontSize: 10.5,
    marginTop: 2,
  },
  assetValue: {
    minWidth: 84,
    color: Colors.text1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    textAlign: 'right',
  },
  noticeRow: {
    minHeight: 58,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: HOME_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_BORDER,
  },
  noticeAction: { flex: 1, minHeight: 56, borderRadius: 18 },
  noticeContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
  },
  noticeIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warningBg,
  },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  noticeDetail: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  noticeDismiss: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowSection: { alignSelf: 'stretch', minWidth: 0 },
});

import React from 'react';
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

import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { MotionView } from '@/components/ui/MotionView';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '@/constants/theme';
import { SUPPORTED_ARC_TESTNET_TOKENS } from '@/constants/tokens';
import { useBalance } from '@/hooks/useBalance';
import { useWalletStore } from '@/store/walletStore';
import { copyWalletAddress } from '@/utils/copyWalletAddress';
import { shortenAddress } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;
type TokenBalances = ReturnType<typeof useWalletStore.getState>['tokenBalances'];

interface ProfileItem {
  title: string;
  detail: string;
  icon: IconName;
  route: string;
  accent?: string;
}

const PROFILE_ITEMS: ProfileItem[] = [
  {
    title: 'Contacts',
    detail: 'Trusted names and wallet addresses',
    icon: 'people-outline',
    route: '/contacts',
    accent: Colors.success,
  },
  {
    title: 'Security and backup',
    detail: 'PIN, biometrics, and recovery phrase',
    icon: 'shield-checkmark-outline',
    route: '/security-backup',
    accent: Colors.warning,
  },
  {
    title: 'Notifications',
    detail: 'Payment and security alerts',
    icon: 'notifications-outline',
    route: '/notifications',
  },
  {
    title: 'Settings',
    detail: 'Currency, network, and developer tools',
    icon: 'settings-outline',
    route: '/(tabs)/settings',
    accent: Colors.text2,
  },
  {
    title: 'Testnet faucet',
    detail: 'Get USDC, EURC, and cirBTC test assets',
    icon: 'water-outline',
    route: '/faucet',
    accent: '#6FA8FF',
  },
];

function AssetsSummary({ balances }: { balances: TokenBalances }) {
  return (
    <View style={styles.assetsPanel}>
      {SUPPORTED_ARC_TESTNET_TOKENS.map((token, index) => {
        const state = balances[token.symbol];
        const value = state?.error ? '—' : state?.formatted ?? '0';

        return (
          <View key={token.symbol}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.assetRow}>
              <View style={[styles.assetIcon, { backgroundColor: `${token.accent}12` }]}>
                <Text style={[styles.assetIconText, { color: token.accent }]}>
                  {token.iconLabel}
                </Text>
              </View>
              <View style={styles.assetCopy}>
                <Text style={styles.assetSymbol}>{token.symbol}</Text>
                <Text style={styles.assetName}>{token.name}</Text>
              </View>
              <View style={styles.assetRight}>
                {state?.isLoading ? (
                  <ActivityIndicator size="small" color={token.accent} />
                ) : (
                  <Text style={styles.assetValue}>{value}</Text>
                )}
                <Text style={styles.assetState}>
                  {state?.error ? 'Unavailable' : 'Arc Testnet'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ProfileRow({ item }: { item: ProfileItem }) {
  const router = useRouter();
  const accent = item.accent ?? Colors.primary;

  return (
    <TouchableOpacity
      style={styles.profileRow}
      activeOpacity={0.72}
      onPress={() => router.push(item.route as any)}
    >
      <View style={[styles.profileIcon, { backgroundColor: `${accent}12` }]}>
        <Ionicons name={item.icon} size={19} color={accent} />
      </View>
      <View style={styles.profileCopy}>
        <Text style={styles.profileTitle}>{item.title}</Text>
        <Text style={styles.profileDetail}>{item.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  useBalance();
  const router = useRouter();
  const { address, tokenBalances } = useWalletStore();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={['rgba(53,213,244,0.075)', 'rgba(7,9,13,0)']}
        style={styles.topWash}
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <MotionView variant="fade" style={styles.header}>
          <View>
            <Text style={styles.kicker}>YOUR WALLET</Text>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Wallet, security, and preferences.</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsHitbox}
            activeOpacity={0.72}
            onPress={() => router.push('/(tabs)/settings' as any)}
          >
            <LiquidGlassSurface
              tone="clear"
              intensity={42}
              style={styles.settingsButton}
              contentStyle={styles.settingsContent}
            >
              <Ionicons name="settings-outline" size={19} color={Colors.text1} />
            </LiquidGlassSurface>
          </TouchableOpacity>
        </MotionView>

        <MotionView delay={40}>
          <LinearGradient
            colors={['#123442', '#142738', '#111721']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.accountCard}
          >
            <View style={styles.accountGlow} pointerEvents="none" />
            <View style={styles.accountIcon}>
              <Ionicons name="wallet-outline" size={22} color={Colors.primary} />
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountLabel}>Self-custodial wallet</Text>
              <Text style={styles.accountAddress}>
                {address ? shortenAddress(address, 8) : 'No wallet connected'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyButton}
              activeOpacity={0.72}
              onPress={() => void copyWalletAddress(address)}
              disabled={!address}
            >
              <Ionicons name="copy-outline" size={17} color={Colors.primary} />
            </TouchableOpacity>
          </LinearGradient>
        </MotionView>

        <MotionView delay={80}>
          <Text style={styles.sectionTitle}>Assets</Text>
          <AssetsSummary balances={tokenBalances} />
        </MotionView>

        <MotionView delay={120}>
          <Text style={[styles.sectionTitle, styles.toolsTitle]}>Wallet Tools</Text>
          <LiquidGlassSurface
            tone="regular"
            intensity={34}
            style={styles.profilePanel}
          >
            {PROFILE_ITEMS.map((item, index) => (
              <View key={item.title}>
                {index > 0 ? <View style={styles.profileDivider} /> : null}
                <ProfileRow item={item} />
              </View>
            ))}
          </LiquidGlassSurface>
        </MotionView>

        <MotionView delay={150} style={styles.testnetStrip}>
          <View style={styles.testnetDot} />
          <Text style={styles.testnetText}>T Pay · Arc Testnet only</Text>
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
    height: 280,
  },
  content: { paddingHorizontal: Spacing.md, paddingTop: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  kicker: {
    color: '#83E9FB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.35,
    marginBottom: 2,
  },
  title: {
    color: Colors.text1,
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.7,
  },
  subtitle: { color: Colors.text2, fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 3 },
  settingsHitbox: {
    width: 42,
    height: 42,
    borderRadius: 15,
  },
  settingsButton: {
    flex: 1,
    borderRadius: 15,
  },
  settingsContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(145,231,255,0.13)',
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#0AA7C4',
    shadowOpacity: 0.11,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  accountGlow: {
    position: 'absolute',
    right: -48,
    top: -74,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(53,213,244,0.12)',
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  accountCopy: { flex: 1 },
  accountLabel: { color: Colors.text2, fontSize: FontSize.xs },
  accountAddress: {
    color: Colors.text1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.md,
    marginTop: 4,
  },
  copyButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  sectionTitle: {
    color: Colors.text1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.md,
    marginBottom: 11,
  },
  assetsPanel: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
  },
  assetIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconText: { fontSize: 12, fontWeight: '700' },
  assetCopy: { flex: 1 },
  assetSymbol: {
    color: Colors.text1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  assetName: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  assetRight: { alignItems: 'flex-end', gap: 2 },
  assetValue: {
    color: Colors.text1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  assetState: { color: Colors.text3, fontSize: 10 },
  divider: { height: 1, marginLeft: 62, backgroundColor: Colors.border },
  toolsTitle: { marginTop: 24 },
  profilePanel: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
  },
  profileIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCopy: { flex: 1 },
  profileTitle: {
    color: Colors.text1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  profileDetail: {
    color: Colors.text3,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 3,
  },
  profileDivider: { height: 1, marginLeft: 64, backgroundColor: Colors.border },
  testnetStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 15,
  },
  testnetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  testnetText: { color: Colors.text3, fontSize: FontSize.xs },
});

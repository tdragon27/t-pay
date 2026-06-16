import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { UtilityBackButton } from '@/components/ui/UtilityBackButton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { SUPPORTED_ARC_TESTNET_TOKENS } from '@/constants/tokens';
import { useBalance } from '@/hooks/useBalance';
import { useWalletStore } from '@/store/walletStore';
import { shortenAddress } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;
type TokenBalances = ReturnType<typeof useWalletStore.getState>['tokenBalances'];

type MoreRoute =
  | '/fx'
  | '/bridge'
  | '/faucet'
  | '/smart-qr'
  | '/contacts'
  | '/split-bill'
  | '/history'
  | '/security-backup'
  | '/gas-sponsorship'
  | '/notifications'
  | '/merchant-analytics'
  | '/insights'
  | '/(tabs)/portfolio'
  | '/(tabs)/invoices'
  | '/(tabs)/recurring'
  | '/(tabs)/settings';

interface MoreItem {
  label: string;
  sublabel: string;
  icon: IconName;
  accent: string;
  route: MoreRoute;
  badge?: string;
}

const MONEY_TOOLS: MoreItem[] = [
  { label: 'Portfolio', sublabel: 'Arc assets and payment overview', icon: 'bar-chart-outline', accent: Colors.primary, route: '/(tabs)/portfolio' },
  { label: 'Activity', sublabel: 'Wallet history and exports', icon: 'receipt-outline', accent: '#6FA8FF', route: '/history' },
  { label: 'Swap', sublabel: 'Exchange supported test assets', icon: 'swap-horizontal-outline', accent: '#8B79FF', route: '/fx' },
  { label: 'Bridge', sublabel: 'Move test funds to Arc', icon: 'git-compare-outline', accent: Colors.warning, route: '/bridge' },
  { label: 'Faucet', sublabel: 'Get USDC, EURC, and cirBTC test assets', icon: 'water-outline', accent: '#6FA8FF', route: '/faucet', badge: 'Testnet' },
  { label: 'Smart QR', sublabel: 'Share a clean payment QR', icon: 'qr-code-outline', accent: Colors.primary, route: '/smart-qr' },
  { label: 'Split Bill', sublabel: 'Group payment links', icon: 'people-circle-outline', accent: '#2DE2C5', route: '/split-bill' },
  { label: 'Contacts', sublabel: 'Saved names and wallets', icon: 'people-outline', accent: Colors.success, route: '/contacts' },
];

const MERCHANT_TOOLS: MoreItem[] = [
  { label: 'Invoices', sublabel: 'Merchant payment requests', icon: 'document-text-outline', accent: Colors.primary, route: '/(tabs)/invoices' },
  { label: 'Recurring', sublabel: 'Scheduled USDC payments', icon: 'repeat-outline', accent: Colors.success, route: '/(tabs)/recurring' },
  { label: 'Analytics', sublabel: 'Revenue and CSV exports', icon: 'analytics-outline', accent: Colors.warning, route: '/merchant-analytics' },
];

const SECURITY_TOOLS: MoreItem[] = [
  { label: 'Security Backup', sublabel: 'Seed phrase and private-key safety', icon: 'shield-checkmark-outline', accent: Colors.warning, route: '/security-backup' },
  { label: 'Notifications', sublabel: 'Payment and security alerts', icon: 'notifications-outline', accent: Colors.primary, route: '/notifications' },
  { label: 'Gas Sponsorship', sublabel: 'Paymaster readiness', icon: 'sparkles-outline', accent: '#FF9F7A', route: '/gas-sponsorship' },
  { label: 'Settings', sublabel: 'Wallet, RPC, and debug tools', icon: 'settings-outline', accent: Colors.text2, route: '/(tabs)/settings' },
];

function ToolRow({ item }: { item: MoreItem }) {
  const router = useRouter();
  return (
    <TouchableOpacity style={styles.toolRow} activeOpacity={0.78} onPress={() => router.push(item.route as any)}>
      <View style={[styles.toolIcon, { backgroundColor: `${item.accent}18`, borderColor: `${item.accent}40` }]}>
        <Ionicons name={item.icon} size={20} color={item.accent} />
      </View>
      <View style={styles.toolMeta}>
        <View style={styles.toolTitleRow}>
          <Text style={styles.toolTitle}>{item.label}</Text>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </View>
        <Text style={styles.toolSub}>{item.sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
    </TouchableOpacity>
  );
}

function Section({ title, items }: { title: string; items: MoreItem[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.sectionCard}>
        {items.map((item, index) => (
          <View key={item.label}>
            <ToolRow item={item} />
            {index < items.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </Card>
    </View>
  );
}

function AssetsSummary({ tokenBalances }: { tokenBalances: TokenBalances }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Assets</Text>
      <LinearGradient colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.028)']} style={styles.assetsCard}>
        {SUPPORTED_ARC_TESTNET_TOKENS.map((token, index) => {
          const balance = tokenBalances[token.symbol];
          const value = balance?.error ? '—' : balance?.formatted ?? '0.00';
          return (
            <View key={token.symbol}>
              <View style={styles.assetRow}>
                <View style={[styles.assetIcon, { backgroundColor: `${token.accent}18`, borderColor: `${token.accent}38` }]}>
                  <Text style={[styles.assetIconText, { color: token.accent }]}>{token.iconLabel}</Text>
                </View>
                <View style={styles.assetMeta}>
                  <Text style={styles.assetSymbol}>{token.symbol}</Text>
                  <Text style={styles.assetName} numberOfLines={1}>{token.name}</Text>
                </View>
                <View style={styles.assetValueWrap}>
                  {balance?.isLoading ? <ActivityIndicator size="small" color={token.accent} /> : <Text style={styles.assetValue}>{value}</Text>}
                  {balance?.error ? <Text style={styles.assetState}>Unavailable</Text> : <Text style={styles.assetState}>Arc Testnet</Text>}
                </View>
              </View>
              {index < SUPPORTED_ARC_TESTNET_TOKENS.length - 1 ? <View style={styles.assetDivider} /> : null}
            </View>
          );
        })}
      </LinearGradient>
    </View>
  );
}

export default function MoreScreen() {
  useBalance();
  const { address, tokenBalances } = useWalletStore();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <UtilityBackButton />
            <View>
              <Text style={styles.kicker}>Wallet profile</Text>
              <Text style={styles.title}>Profile</Text>
            </View>
          </View>
          <View style={styles.walletChip}>
            <Ionicons name="wallet-outline" size={15} color={Colors.primary} />
            <Text style={styles.walletChipText}>{address ? shortenAddress(address, 5) : 'No wallet'}</Text>
          </View>
        </View>

        <LinearGradient colors={['rgba(25,230,255,0.14)', 'rgba(139,121,255,0.06)', 'rgba(255,255,255,0.025)']} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="person-circle-outline" size={22} color={Colors.primary} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Wallet summary</Text>
            <Text style={styles.heroSub}>{address ? shortenAddress(address, 7) : 'Create or import a wallet'} · Arc Testnet assets only</Text>
          </View>
        </LinearGradient>

        <AssetsSummary tokenBalances={tokenBalances} />
        <Section title="Wallet and funds" items={MONEY_TOOLS} />
        <Section title="Merchant records" items={MERCHANT_TOOLS} />
        <Section title="Security and system" items={SECURITY_TOOLS} />

        <View style={{ height: 104 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '800' },
  title: { color: Colors.text1, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.24)' },
  walletChipText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, paddingHorizontal: Spacing.md, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(0,212,255,0.15)', gap: 12, overflow: 'hidden' },
  heroIcon: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)' },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { color: Colors.text1, fontSize: FontSize.lg, lineHeight: 23, fontWeight: '800', letterSpacing: -0.25 },
  heroSub: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17, fontWeight: '600' },
  section: { gap: 9 },
  sectionTitle: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', paddingHorizontal: 4 },
  sectionCard: { padding: 0, overflow: 'hidden' },
  assetsCard: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.085)', padding: 14, overflow: 'hidden' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  assetIcon: { width: 38, height: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  assetIconText: { fontSize: 13, fontWeight: '900' },
  assetMeta: { flex: 1, gap: 2 },
  assetSymbol: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  assetName: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 16 },
  assetValueWrap: { minWidth: 92, alignItems: 'flex-end', gap: 2 },
  assetValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  assetState: { color: Colors.text3, fontSize: 10, fontWeight: '700' },
  assetDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.055)', marginLeft: 49, marginVertical: 8 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  toolIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  toolMeta: { flex: 1, gap: 3 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  toolSub: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17 },
  badge: { color: Colors.warning, fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: Colors.warningBg, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.055)', marginLeft: 70 },
});



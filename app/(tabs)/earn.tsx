import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { buildPassportSnapshot, loadPassportEvents, type PassportBadge, type PassportSnapshot } from '@/services/passportService';
import { useWalletStore } from '@/store/walletStore';
import { formatUsd, shortenAddress } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;

type EarnRoute = '/faucet' | '/fx' | '/bridge' | '/(tabs)/markets' | '/merchant' | '/insights' | '/smart-qr';

interface EarnAction {
  title: string;
  subtitle: string;
  icon: IconName;
  accent: string;
  route: EarnRoute;
}

const EARN_ACTIONS: EarnAction[] = [
  {
    title: 'Create Smart QR',
    subtitle: 'Make a request, split bill, or wallet profile QR.',
    icon: 'qr-code-outline',
    accent: Colors.primary,
    route: '/smart-qr',
  },
  {
    title: 'Fund wallet',
    subtitle: 'Claim Arc testnet USDC and make the wallet usable.',
    icon: 'water-outline',
    accent: Colors.warning,
    route: '/faucet',
  },
  {
    title: 'Swap stablecoins',
    subtitle: 'Practice protected FX routes for configured Arc Testnet rails.',
    icon: 'repeat-outline',
    accent: '#8B79FF',
    route: '/fx',
  },
  {
    title: 'Bridge to Arc',
    subtitle: 'Move liquidity into the low-fee Arc payment rail.',
    icon: 'git-compare-outline',
    accent: Colors.primary,
    route: '/bridge',
  },
  {
    title: 'Community picks',
    subtitle: 'Explore lightweight testnet picks and share QR links.',
    icon: 'pulse-outline',
    accent: Colors.success,
    route: '/(tabs)/markets',
  },
  {
    title: 'Try Merchant QR',
    subtitle: 'Generate a payment QR, scan it, and settle instantly.',
    icon: 'storefront-outline',
    accent: '#FF9F7A',
    route: '/merchant',
  },
  {
    title: 'View insights',
    subtitle: 'See activity trends and wallet readiness signals.',
    icon: 'stats-chart-outline',
    accent: '#6FA8FF',
    route: '/insights',
  },
];

function parseAmount(value: string) {
  return Number(value.replace(/,/g, '')) || 0;
}

function RewardTask({ title, done }: { title: string; done: boolean }) {
  return (
    <View style={styles.taskRow}>
      <View style={[styles.taskCheck, done && styles.taskCheckDone]}>
        <Ionicons name={done ? 'checkmark' : 'ellipse-outline'} size={16} color={done ? Colors.bg : Colors.text3} />
      </View>
      <Text style={[styles.taskText, done && styles.taskTextDone]}>{title}</Text>
    </View>
  );
}

function BadgePill({ badge }: { badge: PassportBadge }) {
  return (
    <View style={[styles.badgePill, badge.earned && styles.badgePillEarned]}>
      <Ionicons name={badge.icon as IconName} size={16} color={badge.earned ? Colors.primary : Colors.text3} />
      <View style={styles.badgeCopy}>
        <Text style={[styles.badgeTitle, badge.earned && styles.badgeTitleEarned]}>{badge.label}</Text>
        <Text style={styles.badgeSub} numberOfLines={1}>{badge.description}</Text>
      </View>
    </View>
  );
}

function EarnActionCard({ action }: { action: EarnAction }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={styles.actionCard}
      onPress={() => {
        Haptics.selectionAsync();
        router.push(action.route as any);
      }}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${action.accent}1F`, borderColor: `${action.accent}44` }]}>
        <Ionicons name={action.icon} size={21} color={action.accent} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionSub}>{action.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
    </TouchableOpacity>
  );
}

export default function EarnScreen() {
  const router = useRouter();
  const { address, transactions, usdcBalanceFormatted, hideBalance } = useWalletStore();
  const usdcBalance = parseAmount(usdcBalanceFormatted);
  const [snapshot, setSnapshot] = useState<PassportSnapshot>(() => buildPassportSnapshot({ address, transactions, usdcBalanceFormatted, events: [] }));

  const refreshPassport = useCallback(async () => {
    const events = await loadPassportEvents(address);
    setSnapshot(buildPassportSnapshot({ address, transactions, usdcBalanceFormatted, events }));
  }, [address, transactions, usdcBalanceFormatted]);

  useFocusEffect(
    useCallback(() => {
      void refreshPassport();
    }, [refreshPassport]),
  );

  const earnedBadges = snapshot.badges.filter((badge) => badge.earned).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>T Pay Passport</Text>
            <Text style={styles.title}>Earn</Text>
          </View>
          <View style={styles.walletChip}>
            <Ionicons name="wallet-outline" size={15} color={Colors.primary} />
            <Text style={styles.walletChipText}>{address ? shortenAddress(address, 5) : 'No wallet'}</Text>
          </View>
        </View>

        <LinearGradient colors={['#13283E', '#10182A', '#0A0A0F']} style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Activity score</Text>
              <Text style={styles.points}>{snapshot.points.toLocaleString('en-US')}</Text>
            </View>
            <View style={styles.levelPill}>
              <Ionicons name="sparkles-outline" size={14} color={Colors.primary} />
              <Text style={styles.levelText}>{snapshot.level}</Text>
            </View>
          </View>
          <Text style={styles.heroSub}>A lightweight testnet passport that reflects how actively this wallet uses T Pay. It is not money, yield, or a token claim.</Text>
          <View style={styles.progressShell}>
            <View style={[styles.progressFill, { width: `${snapshot.progress}%` as any }]} />
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.statValue}>{snapshot.completedActions}</Text>
              <Text style={styles.statLabel}>Actions</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.statValue}>{hideBalance ? '****' : formatUsd(snapshot.totalVolume)}</Text>
              <Text style={styles.statLabel}>Volume</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.statValue}>{snapshot.streakDays}</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
          </View>
        </LinearGradient>

        <Card style={styles.missionCard}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Daily Loop</Text>
              <Text style={styles.sectionSub}>Simple actions that make the app feel alive.</Text>
            </View>
            <Ionicons name="flag-outline" size={22} color={Colors.primary} />
          </View>
          <RewardTask title="Create or import a wallet" done={Boolean(address)} />
          <RewardTask title="Hold testnet USDC" done={usdcBalance > 0} />
          <RewardTask title="Send one Arc payment" done={snapshot.hasSend} />
          <RewardTask title="Scan one Smart QR" done={snapshot.hasSmartQr} />
          <RewardTask title="Join or create one pick" done={snapshot.hasMarketAction} />
        </Card>

        <Card style={styles.badgeCard}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Passport Badges</Text>
              <Text style={styles.sectionSub}>{earnedBadges}/{snapshot.badges.length} unlocked</Text>
            </View>
            <Ionicons name="ribbon-outline" size={22} color={Colors.warning} />
          </View>
          <View style={styles.badgeGrid}>
            {snapshot.badges.map((badge) => <BadgePill key={badge.id} badge={badge} />)}
          </View>
        </Card>

        <View style={styles.ctaRow}>
          <Button label="Scan QR" onPress={() => router.push('/scan' as any)} style={{ flex: 1 }} />
          <Button label="Picks" variant="secondary" onPress={() => router.push('/(tabs)/markets' as any)} style={{ flex: 1 }} />
        </View>

        <Text style={styles.sectionTitle}>More to Try</Text>
        <View style={styles.actionsList}>
          {EARN_ACTIONS.map((action) => (
            <EarnActionCard key={action.title} action={action} />
          ))}
        </View>

        <Card style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.warning} />
          <Text style={styles.noteText}>Mainnet cashback, campaign rewards, or community pick availability should launch only after legal, compliance, and geo-availability review.</Text>
        </Card>

        <View style={{ height: 104 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '800' },
  title: { color: Colors.text1, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.24)' },
  walletChipText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  hero: { borderRadius: 30, padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', overflow: 'hidden', gap: Spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroLabel: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '800' },
  points: { color: Colors.white, fontSize: 48, lineHeight: 54, fontWeight: '800', letterSpacing: -1.7, marginTop: 2 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)' },
  levelText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  progressShell: { height: 8, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full, backgroundColor: Colors.primary },
  heroStats: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(10,10,15,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)' },
  statValue: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800', textAlign: 'center' },
  statLabel: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  missionCard: { gap: 12 },
  badgeCard: { gap: 12 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.2 },
  sectionSub: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 3, lineHeight: 17 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  taskCheck: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Colors.border },
  taskCheckDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  taskText: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  taskTextDone: { color: Colors.text1 },
  badgeGrid: { gap: 8 },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: Colors.border },
  badgePillEarned: { backgroundColor: Colors.primaryGlow, borderColor: 'rgba(0,212,255,0.22)' },
  badgeCopy: { flex: 1, gap: 2 },
  badgeTitle: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '800' },
  badgeTitleEarned: { color: Colors.text1 },
  badgeSub: { color: Colors.text3, fontSize: FontSize.xs },
  ctaRow: { flexDirection: 'row', gap: Spacing.sm },
  actionsList: { gap: Spacing.sm },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  actionIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionCopy: { flex: 1, gap: 3 },
  actionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  actionSub: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.24)' },
  noteText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
});















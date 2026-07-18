import React from 'react';
import {
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
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface PayAction {
  title: string;
  icon: IconName;
  route: string;
  color: string;
}

const PRIMARY_ACTIONS: PayAction[] = [
  {
    title: 'Pay',
    icon: 'arrow-up-outline',
    route: '/send',
    color: Colors.primary,
  },
  {
    title: 'Request',
    icon: 'arrow-down-outline',
    route: '/smart-qr',
    color: '#59E0C5',
  },
  {
    title: 'Scan',
    icon: 'scan-outline',
    route: '/scan',
    color: '#9A8CFF',
  },
];

const MORE_ACTIONS: PayAction[] = [
  {
    title: 'Receive',
    icon: 'qr-code-outline',
    route: '/receive',
    color: '#6FA8FF',
  },
  {
    title: 'Contacts',
    icon: 'people-outline',
    route: '/contacts',
    color: Colors.primary,
  },
  {
    title: 'Swap',
    icon: 'swap-horizontal-outline',
    route: '/fx',
    color: '#9A8CFF',
  },
  {
    title: 'Bridge',
    icon: 'git-compare-outline',
    route: '/bridge',
    color: '#59E0C5',
  },
];

function PrimaryAction({ action }: { action: PayAction }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.primaryHitbox}
      activeOpacity={0.74}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(action.route as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <LiquidGlassSurface
        tone="clear"
        intensity={44}
        style={styles.primaryGlass}
        contentStyle={styles.primaryContent}
      >
        <View style={[styles.primaryIcon, { backgroundColor: `${action.color}18` }]}>
          <Ionicons name={action.icon} size={22} color={action.color} />
        </View>
        <Text style={styles.primaryLabel}>{action.title}</Text>
      </LiquidGlassSurface>
    </TouchableOpacity>
  );
}

function UtilityAction({ action }: { action: PayAction }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.utilityHitbox}
      activeOpacity={0.72}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push(action.route as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <LiquidGlassSurface
        tone="regular"
        intensity={34}
        style={styles.utilityGlass}
        contentStyle={styles.utilityContent}
      >
        <View style={[styles.utilityIcon, { backgroundColor: `${action.color}14` }]}>
          <Ionicons name={action.icon} size={18} color={action.color} />
        </View>
        <Text style={styles.utilityLabel} numberOfLines={1}>
          {action.title}
        </Text>
        <Ionicons name="chevron-forward" size={15} color={Colors.text3} />
      </LiquidGlassSurface>
    </TouchableOpacity>
  );
}

export default function PayHubScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={['rgba(53,213,244,0.09)', 'rgba(7,9,13,0)']}
        style={styles.topWash}
        pointerEvents="none"
      />
      <View style={styles.backgroundOrb} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <MotionView variant="fade" style={styles.header}>
          <Text style={styles.kicker}>PAYMENTS</Text>
          <Text style={styles.title}>Move Money</Text>
          <Text style={styles.subtitle}>Fast, user-confirmed payments on Arc.</Text>
        </MotionView>

        <MotionView delay={35} style={styles.contextStrip}>
          <View style={styles.contextIcon}>
            <Ionicons name="wallet-outline" size={17} color={Colors.primary} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={styles.contextTitle}>Choose an asset when you send</Text>
            <Text style={styles.contextDetail}>Only assets with an Arc Testnet balance are shown.</Text>
          </View>
        </MotionView>

        <MotionView delay={70} style={styles.primaryRow}>
          {PRIMARY_ACTIONS.map((action) => (
            <PrimaryAction key={action.title} action={action} />
          ))}
        </MotionView>

        <MotionView delay={105}>
          <TouchableOpacity
            style={styles.splitHitbox}
            activeOpacity={0.74}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/split-bill' as any);
            }}
            accessibilityRole="button"
            accessibilityLabel="Split a bill"
          >
            <LiquidGlassSurface
              tone="accent"
              intensity={38}
              style={styles.splitGlass}
              contentStyle={styles.splitContent}
            >
              <View style={styles.splitIcon}>
                <Ionicons name="people-outline" size={22} color="#B8AEFF" />
              </View>
              <View style={styles.splitCopy}>
                <Text style={styles.splitTitle}>Split a bill</Text>
                <Text style={styles.splitDetail}>Share one USDC request with your group.</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={Colors.text2} />
            </LiquidGlassSurface>
          </TouchableOpacity>
        </MotionView>

        <MotionView delay={140}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>More Ways to Pay</Text>
            <Text style={styles.sectionHint}>Arc Testnet</Text>
          </View>
          <View style={styles.utilityGrid}>
            {MORE_ACTIONS.map((action) => (
              <UtilityAction key={action.title} action={action} />
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
    height: 300,
  },
  backgroundOrb: {
    position: 'absolute',
    top: 150,
    right: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(139,121,255,0.055)',
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
  },
  header: { marginBottom: 18 },
  kicker: {
    color: '#83E9FB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.35,
  },
  title: {
    color: Colors.text1,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '700',
    letterSpacing: -0.75,
    marginTop: 2,
  },
  subtitle: {
    color: Colors.text2,
    fontSize: FontSize.sm,
    lineHeight: 19,
    marginTop: 2,
  },
  contextStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(53,213,244,0.055)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(145,231,255,0.14)',
  },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  contextCopy: { flex: 1 },
  contextTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  contextDetail: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  balanceCard: {
    minHeight: 146,
    padding: 18,
    borderRadius: 27,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(145,231,255,0.13)',
    shadowColor: '#0AA7C4',
    shadowOpacity: 0.13,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  balanceGlow: {
    position: 'absolute',
    right: -42,
    top: -62,
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: 'rgba(53,213,244,0.12)',
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: { color: '#BCD0DC', fontSize: FontSize.sm, fontWeight: '600' },
  balanceValue: {
    color: Colors.text1,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 12,
  },
  addressText: { color: '#7F8B9B', fontSize: FontSize.xs, marginTop: 7 },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(7,9,13,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  networkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  networkText: { color: Colors.text2, fontSize: 10, fontWeight: '600' },
  primaryRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryHitbox: { flex: 1, minWidth: 0, height: 100, borderRadius: 21 },
  primaryGlass: { flex: 1, borderRadius: 21 },
  primaryContent: { alignItems: 'center', justifyContent: 'center', padding: 10 },
  primaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryLabel: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600', marginTop: 8 },
  splitHitbox: { marginTop: 12, borderRadius: 22 },
  splitGlass: { borderRadius: 22 },
  splitContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  splitIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(154,140,255,0.14)',
  },
  splitCopy: { flex: 1 },
  splitTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '600' },
  splitDetail: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 16, marginTop: 3 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 11,
  },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '600' },
  sectionHint: { color: Colors.text3, fontSize: FontSize.xs },
  utilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  utilityHitbox: { width: '48.4%', height: 60, borderRadius: 18 },
  utilityGlass: { flex: 1, borderRadius: 18 },
  utilityContent: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  utilityIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityLabel: { flex: 1, color: Colors.text2, fontSize: FontSize.xs, fontWeight: '600' },
});

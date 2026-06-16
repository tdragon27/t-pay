import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { createPredictionMarket, estimateYesNoPrice, isPredictionMarketsEnabled, loadPredictionMarkets, type TPayMarket } from '@/services/predictionMarketService';
import { recordPassportEvent } from '@/services/passportService';
import { useWalletStore } from '@/store/walletStore';
import { timeAgo } from '@/utils/format';

const SAMPLE_QUESTIONS = [
  'Will BTC close above $120,000 this week?',
  'Will ETH close above $5,000 this month?',
  'Will Arc Testnet process 10k+ transactions today?',
];

function statusAccent(status: TPayMarket['status']) {
  if (status === 'resolved') return Colors.success;
  if (status === 'cancelled') return Colors.error;
  if (status === 'open') return Colors.primary;
  return Colors.text3;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%` as `${number}%`;
}

function MarketRow({ market, onPress }: { market: TPayMarket; onPress: () => void }) {
  const odds = estimateYesNoPrice(market);
  const accent = statusAccent(market.status);
  const closedForBets = market.status === 'open' && Date.now() >= market.closeTime;

  return (
    <TouchableOpacity style={styles.marketRow} activeOpacity={0.78} onPress={onPress}>
      <View style={styles.marketTopRow}>
        <View style={[styles.categoryPill, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <Text style={[styles.categoryText, { color: accent }]}>{closedForBets ? 'closed' : market.status}</Text>
        </View>
        <Text style={styles.marketId}>#{market.id}</Text>
      </View>
      <Text style={styles.marketQuestion}>{market.question}</Text>
      <Text style={styles.marketMeta}>{market.category} - closes {timeAgo(market.closeTime)}</Text>
      <View style={styles.oddsGrid}>
        <View style={styles.oddsBoxYes}>
          <Text style={styles.oddsLabel}>YES</Text>
          <Text style={styles.oddsValue}>{odds.yes}%</Text>
          <View style={styles.barShell}><View style={[styles.yesBar, { width: pct(market.yesOdds) }]} /></View>
        </View>
        <View style={styles.oddsBoxNo}>
          <Text style={styles.oddsLabel}>NO</Text>
          <Text style={styles.oddsValue}>{odds.no}%</Text>
          <View style={styles.barShell}><View style={[styles.noBar, { width: pct(market.noOdds) }]} /></View>
        </View>
      </View>
      <View style={styles.marketFooter}>
        <Text style={styles.poolText}>{market.totalPool} USDC pool</Text>
        <Text style={styles.participantText}>{market.participantCount ?? 0} participants</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PicksScreen() {
  const router = useRouter();
  const segments = useSegments();
  const inTab = segments[0] === '(tabs)';
  const { address } = useWalletStore();
  const configured = isPredictionMarketsEnabled();
  const [markets, setPicks] = useState<TPayMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [category, setCategory] = useState('Crypto');
  const [closeHours, setCloseHours] = useState('24');

  const openCount = useMemo(() => markets.filter((market) => market.status === 'open').length, [markets]);
  const totalPool = useMemo(() => markets.reduce((sum, market) => sum + Number(market.totalPool.replace(/,/g, '')), 0), [markets]);

  const refresh = useCallback(async () => {
    try {
      const list = await loadPredictionMarkets(address);
      setPicks(list);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Unable to load picks', text2: err?.message ?? 'Check Arc RPC and contract address.' });
    }
  }, [address]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      await refresh();
      if (active) setLoading(false);
    }
    hydrate();
    return () => { active = false; };
  }, [refresh]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handleCreate() {
    if (!configured) {
      Alert.alert('Community picks not configured', 'Deploy the testnet picks contract and set EXPO_PUBLIC_MARKETS_ADDRESS in the app .env file.');
      return;
    }
    const hours = Number(closeHours);
    if (!question.trim()) {
      Alert.alert('Question required', 'Write a clear YES/NO question for the pick.');
      return;
    }
    if (!Number.isFinite(hours) || hours <= 0.05) {
      Alert.alert('Close time too soon', 'Use at least 0.1 hours so users have time to join.');
      return;
    }
    setCreating(true);
    try {
      const result = await createPredictionMarket({
        question,
        category,
        closeTime: Date.now() + Math.round(hours * 60 * 60 * 1000),
        metadataURI: `tpay-market://${Date.now()}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await recordPassportEvent(address, {
        id: `market_create_${result.marketId}`,
        type: 'market_create',
        points: 160,
        label: `Created pick #${result.marketId}`,
        metadata: { marketId: result.marketId, category },
      });
      Toast.show({ type: 'success', text1: 'Pick created', text2: `Pick #${result.marketId}` });
      await refresh();
      router.push({ pathname: '/market/[id]' as any, params: { id: result.marketId } });
    } catch (err: any) {
      Alert.alert('Create pick failed', err?.message ?? 'Unable to create pick.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {inTab ? <View style={styles.iconSpacer} /> : <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}><Ionicons name="arrow-back" size={22} color={Colors.text1} /></TouchableOpacity>}
        <Text style={styles.headerTitle}>T Pay Picks</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}><Ionicons name="refresh-outline" size={20} color={Colors.text2} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}>
        <LinearGradient colors={['#172B35', '#0A0A0F']} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="pulse-outline" size={28} color={Colors.primary} /></View>
          <Text style={styles.heroKicker}>USDC testnet community picks</Text>
          <Text style={styles.heroTitle}>Trade outcomes, not hype.</Text>
          <Text style={styles.heroSub}>Create YES/NO testnet picks on Arc. Positions settle in USDC with low fees and fast finality.</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}><Text style={styles.statValue}>{markets.length}</Text><Text style={styles.statLabel}>Picks</Text></View>
            <View style={styles.statBox}><Text style={styles.statValue}>{openCount}</Text><Text style={styles.statLabel}>Open</Text></View>
            <View style={styles.statBox}><Text style={styles.statValue}>{totalPool.toFixed(2)}</Text><Text style={styles.statLabel}>USDC pool</Text></View>
          </View>
        </LinearGradient>

        <Card style={styles.disclaimerCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.disclaimerTitle}>Testnet-only pick experiment</Text>
            <Text style={styles.disclaimerText}>Community picks are for Arc testnet demos only. Mainnet use requires legal review, geofencing, oracle/dispute controls, and risk limits.</Text>
          </View>
        </Card>

        {!configured ? (
          <Card style={styles.warningCard}>
            <Ionicons name="construct-outline" size={20} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Deploy contract first</Text>
              <Text style={styles.warningText}>Set EXPO_PUBLIC_MARKETS_ADDRESS after deploying the testnet picks contract on Arc Testnet.</Text>
            </View>
          </Card>
        ) : null}

        <Card style={styles.createCard}>
          <View style={styles.sectionTitleRow}>
            <View><Text style={styles.sectionTitle}>Create a pick</Text><Text style={styles.sectionSub}>Keep questions specific and easy to resolve.</Text></View>
            <TouchableOpacity style={styles.shuffleBtn} onPress={() => setQuestion(SAMPLE_QUESTIONS[(SAMPLE_QUESTIONS.indexOf(question) + 1) % SAMPLE_QUESTIONS.length])}>
              <Ionicons name="sparkles-outline" size={17} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <Input label="Question" value={question} onChangeText={setQuestion} placeholder="Will ... ?" multiline />
          <View style={styles.formRow}>
            <Input label="Category" value={category} onChangeText={setCategory} placeholder="Crypto" style={styles.formHalfInput} />
            <Input label="Close hours" value={closeHours} onChangeText={(value) => setCloseHours(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={styles.formHalfInput} />
          </View>
          <Button label={creating ? 'Creating...' : 'Create Pick'} loading={creating} disabled={!configured || creating} onPress={handleCreate} />
        </Card>

        <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>Live picks</Text><Text style={styles.sectionSub}>Tap a card to choose, share QR, or resolve.</Text></View></View>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={Colors.primary} /><Text style={styles.loadingText}>Reading picks from Arc...</Text></View>
        ) : markets.length === 0 ? (
          <Card style={styles.emptyCard}><Ionicons name="planet-outline" size={30} color={Colors.text3} /><Text style={styles.emptyTitle}>No picks yet</Text><Text style={styles.emptyText}>Create the first testnet pick and share the QR with another wallet.</Text></Card>
        ) : (
          markets.map((market) => <MarketRow key={market.id} market={market} onPress={() => router.push({ pathname: '/market/[id]' as any, params: { id: market.id } })} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  iconSpacer: { width: 42, height: 42 },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  hero: { borderRadius: 30, padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)', overflow: 'hidden' },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.28)', marginBottom: Spacing.md },
  heroKicker: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  heroTitle: { color: Colors.text1, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, marginTop: 5 },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 21, marginTop: 9 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.lg },
  statBox: { flex: 1, padding: 12, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statValue: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  warningCard: { flexDirection: 'row', gap: 10, backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  warningTitle: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '800' },
  warningText: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 18, marginTop: 2 },
  disclaimerCard: { flexDirection: 'row', gap: 10, backgroundColor: '#19140D', borderColor: 'rgba(255,181,71,0.28)' },
  disclaimerTitle: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '800' },
  disclaimerText: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 18, marginTop: 2 },
  createCard: { gap: Spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  sectionSub: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 3 },
  shuffleBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)' },
  formRow: { flexDirection: 'row', gap: 10 },
  formHalfInput: { minWidth: 0 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl, gap: 12 },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm },
  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: Spacing.xl },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  emptyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  marketRow: { padding: Spacing.md, borderRadius: 24, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  marketTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  categoryText: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase' },
  marketId: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800' },
  marketQuestion: { color: Colors.text1, fontSize: FontSize.lg, lineHeight: 23, fontWeight: '800' },
  marketMeta: { color: Colors.text3, fontSize: FontSize.xs },
  oddsGrid: { flexDirection: 'row', gap: 10 },
  oddsBoxYes: { flex: 1, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: 'rgba(0,232,143,0.2)' },
  oddsBoxNo: { flex: 1, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: 'rgba(255,77,106,0.2)' },
  oddsLabel: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 0.8 },
  oddsValue: { color: Colors.text1, fontSize: FontSize.xl, fontWeight: '800', marginTop: 2 },
  barShell: { height: 5, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 9, overflow: 'hidden' },
  yesBar: { height: '100%', backgroundColor: Colors.success },
  noBar: { height: '100%', backgroundColor: Colors.error },
  marketFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  poolText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '800' },
  participantText: { color: Colors.text3, fontSize: FontSize.sm, fontWeight: '700' },
});






























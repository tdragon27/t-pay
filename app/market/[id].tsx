import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { cancelPredictionMarket, claimPredictionMarket, estimateYesNoPrice, getPredictionMarketOwner, loadPredictionMarket, placePredictionBet, resolvePredictionMarket, type MarketOutcome, type TPayMarket } from '@/services/predictionMarketService';
import { buildSmartQrLink } from '@/services/paymentRequestService';
import { recordPassportEvent } from '@/services/passportService';
import { useWalletStore } from '@/store/walletStore';
import { sanitizeAmount, shortenHash, timeAgo } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ensureCriticalAuth } from '@/services/securityService';
import { safeOpenTx } from '@/utils/safeOpenUrl';

const QR_SIZE = Math.min(Dimensions.get('window').width - 112, 220);
type BusyState = 'idle' | 'yes' | 'no' | 'claim' | 'resolveYes' | 'resolveNo' | 'cancel';

function statusAccent(status?: TPayMarket['status']) {
  if (status === 'resolved') return Colors.success;
  if (status === 'cancelled') return Colors.error;
  if (status === 'open') return Colors.primary;
  return Colors.text3;
}
function numberValue(value?: string) { return Number((value ?? '0').replace(/,/g, '')) || 0; }
function outcomeLabel(value?: MarketOutcome) { return value === 'yes' ? 'YES' : value === 'no' ? 'NO' : 'Pending'; }

export default function MarketDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { address } = useWalletStore();
  const { isOffline } = useNetworkStatus();
  const marketId = typeof params.id === 'string' ? params.id : '';
  const [market, setMarket] = useState<TPayMarket | null>(null);
  const [owner, setOwner] = useState<`0x${string}` | null>(null);
  const [amount, setAmount] = useState('1');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const marketLink = useMemo(() => buildSmartQrLink({ type: 'market', marketId }), [marketId]);
  const odds = market ? estimateYesNoPrice(market) : { yes: 50, no: 50 };
  const isOwner = Boolean(owner && address && owner.toLowerCase() === address.toLowerCase());
  const isOpen = market?.status === 'open' && Date.now() < market.closeTime;
  const canResolve = Boolean(isOwner && market?.status === 'open' && Date.now() >= market.closeTime);
  const canClaim = Boolean(market && !market.userClaimed && numberValue(market.userClaimable) > 0);
  const accent = statusAccent(market?.status);

  const refresh = useCallback(async () => {
    if (!marketId) return;
    try {
      const [nextMarket, nextOwner] = await Promise.all([loadPredictionMarket(marketId, address), getPredictionMarketOwner()]);
      setMarket(nextMarket);
      setOwner(nextOwner);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load pick.');
    }
  }, [marketId, address]);

  useEffect(() => {
    let active = true;
    async function hydrate() { setLoading(true); await refresh(); if (active) setLoading(false); }
    hydrate();
    return () => { active = false; };
  }, [refresh]);

  async function copyLink() {
    await Clipboard.setStringAsync(marketLink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Pick link copied', text2: `Pick #${marketId}` });
  }
  async function shareLink() { await Share.share({ title: 'T Pay Pick', message: `${market?.question ?? 'T Pay Pick'}\n${marketLink}` }); }

  async function handleBet(outcome: MarketOutcome) {
    if (!market) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before placing a position.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before placing a position.');
    if (!isOpen) return Alert.alert('Pick closed', 'This pick is no longer accepting positions.');
    if (!amount || Number(amount) <= 0) return Alert.alert('Invalid amount', 'Enter a positive USDC amount.');
    setBusy(outcome); setError(null);
    try {
      const txHash = await placePredictionBet({ marketId: market.id, outcome, amount });
      setLastTx(txHash);
      await recordPassportEvent(address, {
        id: `market_bet_${market.id}_${txHash}`,
        type: 'market_bet',
        points: 180,
        label: `${outcomeLabel(outcome)} on pick #${market.id}`,
        metadata: { marketId: market.id, outcome, amount },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: `${outcomeLabel(outcome)} bet placed`, text2: shortenHash(txHash) });
      await refresh();
    } catch (err: any) {
      const message = err?.shortMessage ?? err?.message ?? 'Unable to submit pick.';
      setError(message); Alert.alert('Bet failed', message);
    } finally { setBusy('idle'); }
  }

  async function handleClaim() {
    if (!market) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before claiming.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before claiming.');
    setBusy('claim'); setError(null);
    try {
      const txHash = await claimPredictionMarket(market.id);
      setLastTx(txHash);
      await recordPassportEvent(address, {
        id: `market_claim_${market.id}_${txHash}`,
        type: 'market_claim',
        points: 120,
        label: `Claimed pick #${market.id}`,
        metadata: { marketId: market.id },
      });
      Toast.show({ type: 'success', text1: 'Claim complete', text2: shortenHash(txHash) });
      await refresh();
    } catch (err: any) {
      const message = err?.shortMessage ?? err?.message ?? 'Unable to claim payout.';
      setError(message); Alert.alert('Claim failed', message);
    } finally { setBusy('idle'); }
  }

  async function handleResolve(outcome: MarketOutcome) {
    if (!market) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before resolving.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before resolving.');
    setBusy(outcome === 'yes' ? 'resolveYes' : 'resolveNo'); setError(null);
    try {
      const txHash = await resolvePredictionMarket(market.id, outcome);
      setLastTx(txHash);
      Toast.show({ type: 'success', text1: `Resolved ${outcomeLabel(outcome)}`, text2: shortenHash(txHash) });
      await refresh();
    } catch (err: any) {
      const message = err?.shortMessage ?? err?.message ?? 'Unable to resolve pick.';
      setError(message); Alert.alert('Resolve failed', message);
    } finally { setBusy('idle'); }
  }

  async function runCancel() {
    if (!market) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before cancelling.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before cancelling.');
    setBusy('cancel'); setError(null);
    try {
      const txHash = await cancelPredictionMarket(market.id);
      setLastTx(txHash);
      Toast.show({ type: 'success', text1: 'Pick cancelled', text2: shortenHash(txHash) });
      await refresh();
    } catch (err: any) {
      const message = err?.shortMessage ?? err?.message ?? 'Unable to cancel pick.';
      setError(message); Alert.alert('Cancel failed', message);
    } finally { setBusy('idle'); }
  }
  function handleCancel() {
    Alert.alert('Cancel pick?', 'Cancelling allows participants to claim refunds.', [
      { text: 'Keep open', style: 'cancel' },
      { text: 'Cancel pick', style: 'destructive', onPress: runCancel },
    ]);
  }

  if (!marketId) return <EmptyState title="Missing pick id." onPress={() => router.replace('/markets' as any)} />;
  if (loading) return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><View style={styles.center}><ActivityIndicator color={Colors.primary} /><Text style={styles.loadingText}>Loading pick from Arc...</Text></View></SafeAreaView>;
  if (!market) return <EmptyState title={error ?? 'Pick not found. Check contract address or pick id.'} onPress={() => router.replace('/markets' as any)} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}><Ionicons name="arrow-back" size={22} color={Colors.text1} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Pick #{market.id}</Text>
        <TouchableOpacity onPress={refresh} style={styles.iconBtn}><Ionicons name="refresh-outline" size={19} color={Colors.text2} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={[styles.heroCard, { borderColor: `${accent}55` }]}>
          <View style={[styles.statusPill, { borderColor: `${accent}55`, backgroundColor: `${accent}15` }]}><View style={[styles.statusDot, { backgroundColor: accent }]} /><Text style={[styles.statusText, { color: accent }]}>{market.status}</Text></View>
          <Text style={styles.question}>{market.question}</Text>
          <Text style={styles.meta}>{market.category} - closes {timeAgo(market.closeTime)}</Text>
          <View style={styles.poolStrip}><Text style={styles.poolValue}>{market.totalPool} USDC</Text><Text style={styles.poolLabel}>total pool</Text></View>
        </Card>
        <Card style={styles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={19} color={Colors.warning} />
          <Text style={styles.disclaimerText}>Testnet pick disclosure: this is not a production wagering product. Resolution is owner-administered until oracle, dispute, legal, and jurisdiction controls are added.</Text>
        </Card>

        <View style={styles.oddsGrid}>
          <Card style={styles.yesCard}><Text style={styles.outcomeLabel}>YES</Text><Text style={styles.outcomePct}>{odds.yes}%</Text><Text style={styles.outcomeSub}>{market.totalYes} USDC</Text></Card>
          <Card style={styles.noCard}><Text style={styles.outcomeLabel}>NO</Text><Text style={styles.outcomePct}>{odds.no}%</Text><Text style={styles.outcomeSub}>{market.totalNo} USDC</Text></Card>
        </View>
        <Card style={styles.tradeCard}>
          <Text style={styles.sectionTitle}>{isOpen ? 'Make a USDC pick' : 'Pick actions'}</Text>
          <Text style={styles.sectionSub}>{isOpen ? 'Pick YES or NO. Approval is requested only if needed.' : 'Bets are closed. Wait for resolution or claim payout/refund.'}</Text>
          {isOpen ? <><Input label="Amount (USDC)" value={amount} onChangeText={(value) => setAmount(sanitizeAmount(value))} keyboardType="decimal-pad" placeholder="1.00" /><View style={styles.actionRow}><Button label="Bet YES" loading={busy === 'yes'} disabled={busy !== 'idle'} onPress={() => handleBet('yes')} style={{ flex: 1 }} /><Button label="Bet NO" variant="danger" loading={busy === 'no'} disabled={busy !== 'idle'} onPress={() => handleBet('no')} style={{ flex: 1 }} /></View></> : null}
          <View style={styles.positionBox}><DetailRow label="Your YES" value={`${market.userYes ?? '0.00'} USDC`} /><DetailRow label="Your NO" value={`${market.userNo ?? '0.00'} USDC`} /><DetailRow label="Claimable" value={`${market.userClaimable ?? '0.00'} USDC`} highlight /><DetailRow label="Winning outcome" value={outcomeLabel(market.winningOutcome)} /></View>
          {canClaim ? <Button label={busy === 'claim' ? 'Claiming...' : 'Claim Payout'} loading={busy === 'claim'} disabled={busy !== 'idle'} onPress={handleClaim} /> : null}
        </Card>
        <Card style={styles.qrCard}>
          <View style={styles.sectionTitleRow}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Share pick</Text><Text style={styles.sectionSub}>Another wallet can scan this QR and open the same pick.</Text></View><Ionicons name="qr-code-outline" size={22} color={Colors.primary} /></View>
          <View style={styles.qrShell}><QRCode value={marketLink} size={QR_SIZE} color={Colors.text1} backgroundColor={Colors.surface} /></View>
          <View style={styles.actionRow}><Button label="Copy" variant="secondary" onPress={copyLink} style={{ flex: 1 }} /><Button label="Share" variant="secondary" onPress={shareLink} style={{ flex: 1 }} /></View>
        </Card>
        {isOwner ? <Card style={styles.adminCard}><Text style={styles.sectionTitle}>Admin resolver</Text><Text style={styles.sectionSub}>Only contract owner can resolve or cancel. Resolve after close time.</Text>{canResolve ? <View style={styles.actionRow}><Button label="Resolve YES" loading={busy === 'resolveYes'} disabled={busy !== 'idle'} onPress={() => handleResolve('yes')} style={{ flex: 1 }} /><Button label="Resolve NO" variant="danger" loading={busy === 'resolveNo'} disabled={busy !== 'idle'} onPress={() => handleResolve('no')} style={{ flex: 1 }} /></View> : <Text style={styles.adminHint}>{market.status === 'open' ? 'Resolution unlocks after close time.' : 'Market is already finalized.'}</Text>}{market.status === 'open' ? <Button label="Cancel Pick" variant="ghost" loading={busy === 'cancel'} disabled={busy !== 'idle'} onPress={handleCancel} /> : null}</Card> : null}
        {lastTx ? <TouchableOpacity style={styles.txLink} onPress={() => void safeOpenTx(lastTx)}><Ionicons name="open-outline" size={16} color={Colors.primary} /><Text style={styles.txLinkText}>View last tx {shortenHash(lastTx)}</Text></TouchableOpacity> : null}
        {error ? <Card style={styles.errorCard}><Ionicons name="alert-circle-outline" size={18} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></Card> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ title, onPress }: { title: string; onPress: () => void }) {
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><View style={styles.center}><Ionicons name="alert-circle-outline" size={34} color={Colors.error} /><Text style={styles.errorText}>{title}</Text><Button label="Back to Picks" onPress={onPress} /></View></SafeAreaView>;
}
function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={[styles.detailValue, highlight && styles.detailHighlight]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: 12 },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm },
  heroCard: { gap: 12, backgroundColor: '#10161F' },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#19140D', borderColor: 'rgba(255,181,71,0.28)' },
  disclaimerText: { color: Colors.warning, fontSize: FontSize.xs, lineHeight: 18, flex: 1 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase' },
  question: { color: Colors.text1, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.7 },
  meta: { color: Colors.text2, fontSize: FontSize.sm },
  poolStrip: { padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)' },
  poolValue: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800' },
  poolLabel: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  oddsGrid: { flexDirection: 'row', gap: 10 },
  yesCard: { flex: 1, backgroundColor: Colors.successBg, borderColor: 'rgba(0,232,143,0.24)' },
  noCard: { flex: 1, backgroundColor: Colors.errorBg, borderColor: 'rgba(255,77,106,0.24)' },
  outcomeLabel: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1 },
  outcomePct: { color: Colors.text1, fontSize: 34, fontWeight: '800', marginTop: 4 },
  outcomeSub: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 4 },
  tradeCard: { gap: Spacing.md },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  sectionSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  positionBox: { padding: 12, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: Colors.border, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { color: Colors.text2, fontSize: FontSize.sm },
  detailValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800', textAlign: 'right', flex: 1 },
  detailHighlight: { color: Colors.success },
  qrCard: { gap: Spacing.md, alignItems: 'stretch' },
  qrShell: { alignSelf: 'center', padding: 18, borderRadius: 28, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  adminCard: { gap: Spacing.md, borderColor: 'rgba(255,181,71,0.24)' },
  adminHint: { color: Colors.warning, fontSize: FontSize.sm },
  txLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)' },
  txLinkText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '800' },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.errorBg, borderColor: 'rgba(255,77,106,0.28)' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', flex: 1 },
});


































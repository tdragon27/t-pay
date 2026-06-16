import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useWalletStore } from '@/store/walletStore';
import { formatSplitSyncError, useSplitBills, type SplitFilter } from '@/hooks/useSplitBills';
import { buildSplitPaymentLink, createSplitBill, expiryMsFromPreset, splitLifecycleStatus, splitProgress, type SplitBill, type SplitExpiryPreset } from '@/services/splitBillService';
import { sanitizeDecimalInput } from '@/utils/format';

const MAX_PEOPLE = 30;

const FILTERS: Array<{ id: SplitFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'partial', label: 'Partial' },
  { id: 'complete', label: 'Complete' },
  { id: 'expired', label: 'Expired' },
];

const EXPIRY_OPTIONS: Array<{ id: SplitExpiryPreset; label: string }> = [
  { id: '24h', label: '24h' },
  { id: '48h', label: '48h' },
  { id: '7d', label: '7d' },
  { id: 'none', label: 'No expiry' },
];

function isAddressReady(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function amountNumber(value: string) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function peopleNumber(value: string) {
  return Math.max(1, Math.min(MAX_PEOPLE, Number(value) || 1));
}

function calculateShare(totalInput: string, peopleInput: string) {
  const totalCents = Math.max(0, Math.round(amountNumber(totalInput) * 100));
  const count = peopleNumber(peopleInput);
  return (Math.floor(totalCents / count) / 100).toFixed(2);
}

function buildEqualParticipants(totalInput: string, peopleInput: string) {
  const count = peopleNumber(peopleInput);
  const totalCents = Math.max(0, Math.round(amountNumber(totalInput) * 100));
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  return Array.from({ length: count }).map((_, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return {
      name: `Person ${index + 1}`,
      amountUsdc: (cents / 100).toFixed(2),
    };
  });
}

function statusCopy(status: ReturnType<typeof splitLifecycleStatus>) {
  if (status === 'partial') return 'Partial';
  if (status === 'complete') return 'Complete';
  if (status === 'expired') return 'Expired';
  if (status === 'cancelled') return 'Cancelled';
  return 'Open';
}

function expiryCopy(split: SplitBill) {
  if (!split.expiresAt) return 'No expiry';
  const date = new Date(split.expiresAt);
  const expired = Date.now() > split.expiresAt;
  return `${expired ? 'Expired' : 'Expires'} ${date.toLocaleDateString()}`;
}

export default function SplitBillScreen() {
  const router = useRouter();
  const address = useWalletStore((state) => state.address);
  const [total, setTotal] = useState('30');
  const [people, setPeople] = useState('6');
  const [note, setNote] = useState('Dinner split');
  const [receiverWallet, setReceiverWallet] = useState('');
  const [expiryPreset, setExpiryPreset] = useState<SplitExpiryPreset>('48h');
  const [filter, setFilter] = useState<SplitFilter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const { splits, loading, refreshing, error, configured, refresh } = useSplitBills({ filter, search });
  const totalValue = amountNumber(total);
  const peopleCount = peopleNumber(people);
  const shareAmount = useMemo(() => calculateShare(total, people), [total, people]);
  const hasSplitFilters = search.trim().length > 0 || filter !== 'all';
  const receiver = receiverWallet.trim() || address || '';

  useEffect(() => {
    if (address && !receiverWallet) setReceiverWallet(address);
  }, [address, receiverWallet]);

  function updatePeople(value: string) {
    setPeople(value.replace(/[^0-9]/g, '').slice(0, 2));
  }

  async function handleCreate() {
    if (!configured) {
      Alert.alert('Split sync is not configured yet.', 'Add Supabase configuration before creating synced split bills.');
      return;
    }
    if (totalValue <= 0) return Alert.alert('Invalid total', 'Total USDC must be greater than 0.');
    if (peopleCount <= 0) return Alert.alert('Invalid people count', 'People must be at least 1.');
    if (!note.trim()) return Alert.alert('Missing note', 'Add a short note so people know what this split is for.');
    if (!isAddressReady(receiver)) return Alert.alert('Invalid receiver wallet', 'Please enter a valid 0x wallet address.');

    setBusy(true);
    try {
      const split = await createSplitBill({
        receiverWallet: receiver,
        totalUsdc: total,
        peopleCount,
        autoDivide: true,
        completeByTotal: true,
        note: note.trim(),
        expiresAt: expiryMsFromPreset(expiryPreset),
        participants: buildEqualParticipants(total, people),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Split created', text2: `${shareAmount} USDC per person` });
      await refresh();
      router.push({ pathname: '/split/[id]' as any, params: { id: split.id } });
    } catch (err: any) {
      Alert.alert('Unable to create split bill', formatSplitSyncError(err));
    } finally {
      setBusy(false);
    }
  }

  async function shareSplit(split: SplitBill) {
    const progress = splitProgress(split);
    const link = buildSplitPaymentLink(split);
    await Share.share({
      title: 'T Pay Split Bill',
      message: `${split.note ?? 'Split bill'}\n${progress.receivedUsdc} / ${progress.totalUsdc} USDC collected\nPay your share: ${link}`,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => safeBack(router)} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Split Bill</Text>
          <Text style={styles.subtitle}>Create one USDC group payment link.</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!configured ? (
              <Card style={styles.warningCard}>
                <Ionicons name="cloud-offline-outline" size={18} color={Colors.warning} />
                <Text style={styles.warningText}>Split sync is not configured yet.</Text>
              </Card>
            ) : null}

            <Card style={styles.formCard}>
              <View>
                <Text style={styles.sectionTitle}>Create split</Text>
                <Text style={styles.sectionSub}>Split Bill uses USDC on Arc Testnet.</Text>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Input label="Total USDC" value={total} onChangeText={(value) => setTotal(sanitizeDecimalInput(value, 6))} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
                <View style={styles.col}>
                  <Input label="People" value={people} onChangeText={updatePeople} keyboardType="number-pad" placeholder="2" />
                </View>
              </View>

              <Input label="Note" value={note} onChangeText={setNote} placeholder="Dinner, trip, team lunch..." />
              <Input label="Receiver wallet" value={receiverWallet} onChangeText={(value) => setReceiverWallet(value.trim())} placeholder={address ?? '0x...'} autoCapitalize="none" autoCorrect={false} />

              <View>
                <Text style={styles.expiryLabel}>Expiry</Text>
                <View style={styles.expiryRow}>
                  {EXPIRY_OPTIONS.map((option) => (
                    <TouchableOpacity key={option.id} style={[styles.expiryPill, expiryPreset === option.id && styles.expiryPillActive]} onPress={() => setExpiryPreset(option.id)} activeOpacity={0.82}>
                      <Text style={[styles.expiryText, expiryPreset === option.id && styles.expiryTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.shareSummary}>
                <Metric label="Each person" value={`${shareAmount} USDC`} />
                <View style={styles.summaryDivider} />
                <Metric label="People" value={String(peopleCount)} />
                <View style={styles.summaryDivider} />
                <Metric label="Total" value={`${totalValue.toFixed(2)} USDC`} />
              </View>

              <Button label={busy ? 'Creating...' : 'Create Split'} onPress={handleCreate} loading={busy} disabled={busy || !configured || totalValue <= 0} />
            </Card>

            <View style={styles.toolsCard}>
              <Input label="Search bills" value={search} onChangeText={setSearch} placeholder="Search by note..." />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {FILTERS.map((item) => (
                  <TouchableOpacity key={item.id} style={[styles.filterPill, filter === item.id && styles.filterPillActive]} onPress={() => setFilter(item.id)} activeOpacity={0.82}>
                    <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Split history</Text>
              {refreshing ? <Text style={styles.refreshingText}>Syncing...</Text> : null}
            </View>

            {loading ? <SplitHistoryLoading /> : null}
            {!loading && error ? <Card style={styles.errorCard}><Ionicons name="alert-circle-outline" size={18} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></Card> : null}
            {!loading && !error && splits.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="people-outline" size={30} color={Colors.text3} />
                <Text style={styles.emptyTitle}>{hasSplitFilters ? 'No split bills found' : 'No split bills yet.'}</Text>
                <Text style={styles.emptyText}>{hasSplitFilters ? 'Try another search or filter.' : 'Create a USDC split and share one payment link.'}</Text>
              </Card>
            ) : null}
            {splits.map((split) => (
              <SplitBillRow
                key={split.id}
                split={split}
                onView={() => router.push({ pathname: '/split/[id]' as any, params: { id: split.id } })}
                onShare={() => shareSplit(split)}
              />
            ))}
            <View style={{ height: 90 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SplitHistoryLoading() {
  return (
    <View style={styles.loadingList}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.loadingRow}>
          <Skeleton style={styles.loadingIcon} />
          <View style={styles.loadingTextGroup}>
            <Skeleton style={styles.loadingTitle} />
            <Skeleton style={styles.loadingSub} />
          </View>
          <Skeleton style={styles.loadingPill} />
        </View>
      ))}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SplitBillRow({ split, onView, onShare }: { split: SplitBill; onView: () => void; onShare: () => void }) {
  const progress = splitProgress(split);
  const status = splitLifecycleStatus(split);
  const collected = `${progress.receivedUsdc} / ${progress.totalUsdc} USDC collected`;

  return (
    <Card style={[styles.billCard, (status === 'expired' || status === 'cancelled') && styles.billCardMuted]}>
      <TouchableOpacity onPress={onView} activeOpacity={0.82}>
        <View style={styles.billTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.billTitle} numberOfLines={1}>{split.note ?? 'Split bill'}</Text>
            <Text style={styles.billSub}>{collected}</Text>
          </View>
          <StatusPill status={status} />
        </View>

        <View style={styles.progressHeader}>
          <Text style={styles.percentText}>{progress.percent}%</Text>
          <Text style={styles.expiryTextSmall}>{expiryCopy(split)}</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress.percent}%` }]} /></View>
      </TouchableOpacity>

      <View style={styles.billActions}>
        <TouchableOpacity style={styles.rowAction} onPress={onView} activeOpacity={0.78}>
          <Ionicons name="open-outline" size={15} color={Colors.primary} />
          <Text style={styles.rowActionText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rowActionSecondary} onPress={onShare} activeOpacity={0.78}>
          <Ionicons name="share-outline" size={15} color={Colors.text2} />
          <Text style={styles.rowActionSecondaryText}>Share</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function StatusPill({ status }: { status: ReturnType<typeof splitLifecycleStatus> }) {
  return (
    <Text style={[
      styles.statusPill,
      status === 'partial' && styles.statusPartial,
      status === 'complete' && styles.statusComplete,
      (status === 'expired' || status === 'cancelled') && styles.statusMuted,
    ]}>
      {statusCopy(status)}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  keyboardView: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.text1, fontSize: 29, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 2 },
  content: { padding: Spacing.md, gap: Spacing.md },
  warningCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  warningText: { color: Colors.warning, fontSize: FontSize.sm, lineHeight: 19, flex: 1 },
  formCard: { gap: Spacing.md },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  sectionSub: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  expiryLabel: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '500', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  expiryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expiryPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.elevated },
  expiryPillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  expiryText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800' },
  expiryTextActive: { color: Colors.primary },
  shareSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14, borderRadius: Radius.xl, backgroundColor: 'rgba(0,212,255,0.07)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.16)' },
  summaryLabel: { color: Colors.text3, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  summaryValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800', marginTop: 4 },
  summaryDivider: { width: 1, height: 34, backgroundColor: Colors.border },
  toolsCard: { gap: 10 },
  filterRow: { gap: 8, paddingRight: 8 },
  filterPill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.elevated },
  filterPillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  filterText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800' },
  filterTextActive: { color: Colors.primary },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listTitle: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  refreshingText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  loadingList: { gap: 10 },
  loadingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  loadingIcon: { width: 34, height: 34, borderRadius: 12 },
  loadingTextGroup: { flex: 1, gap: 7 },
  loadingTitle: { width: '54%', height: 12, borderRadius: Radius.full },
  loadingSub: { width: '78%', height: 10, borderRadius: Radius.full },
  loadingPill: { width: 58, height: 24, borderRadius: Radius.full },
  errorCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.errorBg, borderColor: 'rgba(255,77,106,0.28)' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, flex: 1 },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 16 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  emptyText: { color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  billCard: { gap: 12, backgroundColor: 'rgba(255,255,255,0.045)' },
  billCardMuted: { opacity: 0.72 },
  billTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  billTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  billSub: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 4 },
  statusPill: { color: Colors.warning, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.warningBg, overflow: 'hidden' },
  statusPartial: { color: Colors.primary, backgroundColor: Colors.primaryGlow },
  statusComplete: { color: Colors.success, backgroundColor: Colors.successBg },
  statusMuted: { color: Colors.text3, backgroundColor: Colors.elevated },
  progressHeader: { marginTop: 12, marginBottom: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  percentText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '900' },
  expiryTextSmall: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: Radius.full, backgroundColor: Colors.elevated, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full, backgroundColor: Colors.primary },
  billActions: { flexDirection: 'row', gap: 10 },
  rowAction: { flex: 1, minHeight: 40, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.24)' },
  rowActionText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '900' },
  rowActionSecondary: { flex: 1, minHeight: 40, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  rowActionSecondaryText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '900' },
});


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { UtilityBackButton } from '@/components/ui/UtilityBackButton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { INTERVAL_PRESETS, isRecurringConfigured } from '@/constants/contracts';
import { recurringService, type CreateSubParams, type Subscription } from '@/services/recurringService';
import { useWalletStore } from '@/store/walletStore';
import { shortenAddress } from '@/utils/format';

function formatDate(value: Date | null) {
  if (!value) return 'No end date';
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out. Pull to refresh or check RPC/contract config.`)), ms);
    promise
      .then((value) => { clearTimeout(timer); resolve(value); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

function timeUntil(value: Date) {
  const diff = value.getTime() - Date.now();
  if (diff <= 0) return 'Due now';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${Math.max(hours, 1)}h`;
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </Card>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SubscriptionCard({
  item,
  busy,
  onPause,
  onResume,
  onTrigger,
  onCancel,
}: {
  item: Subscription;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onTrigger: () => void;
  onCancel: () => void;
}) {
  const accent = !item.active ? Colors.text3 : item.isDue ? Colors.warning : Colors.success;
  const statusLabel = !item.active ? 'Paused' : item.isDue ? 'Due now' : 'Active';

  return (
    <Card style={styles.subCard}>
      <View style={styles.subHeader}>
        <View style={[styles.subAvatar, { backgroundColor: `${accent}22`, borderColor: `${accent}44` }]}>
          <Text style={[styles.subAvatarText, { color: accent }]}>{item.label.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.subTitle}>{item.label}</Text>
          <Text style={styles.subMeta}>{shortenAddress(item.payee, 6)} � {item.intervalLabel}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={styles.subAmount}>${item.amount.toFixed(2)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${accent}18`, borderColor: `${accent}35` }]}>
            <Text style={[styles.statusBadgeText, { color: accent }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.subGrid}>
        <View style={styles.subGridItem}>
          <Text style={styles.subGridLabel}>Next payment</Text>
          <Text style={styles.subGridValue}>{formatDate(item.nextPaymentAt)}</Text>
          <Text style={styles.subGridHint}>{timeUntil(item.nextPaymentAt)}</Text>
        </View>
        <View style={styles.subGridItem}>
          <Text style={styles.subGridLabel}>End date</Text>
          <Text style={styles.subGridValue}>{formatDate(item.endAt)}</Text>
        </View>
        <View style={styles.subGridItem}>
          <Text style={styles.subGridLabel}>Total paid</Text>
          <Text style={styles.subGridValue}>${item.totalPaid.toFixed(2)}</Text>
        </View>
        <View style={styles.subGridItem}>
          <Text style={styles.subGridLabel}>Payments</Text>
          <Text style={styles.subGridValue}>{item.paymentsCount}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        {item.active ? (
          <Button label="Pause" variant="secondary" fullWidth={false} onPress={onPause} disabled={busy} />
        ) : (
          <Button label="Resume" variant="secondary" fullWidth={false} onPress={onResume} disabled={busy} />
        )}
        <Button
          label={item.isDue ? 'Pay Now' : 'Run'}
          fullWidth={false}
          onPress={onTrigger}
          disabled={busy || (!item.active && !item.isDue)}
        />
        <Button label="Cancel" variant="danger" fullWidth={false} onPress={onCancel} disabled={busy} />
      </View>
    </Card>
  );
}

const DEFAULT_FORM: CreateSubParams = {
  payee: '',
  amount: '',
  interval: INTERVAL_PRESETS[3].seconds,
  label: '',
};

function CreateRecurringModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState<CreateSubParams>(DEFAULT_FORM);
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setForm(DEFAULT_FORM);
      setEndDate('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  async function handleSubmit() {
    setError('');

    if (!form.label.trim()) return setError('Add a label for this recurring payment.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(form.payee.trim())) return setError('Recipient address is invalid.');
    if (!form.amount || Number(form.amount) <= 0) return setError('Amount must be greater than zero.');

    let endAt: number | undefined;
    if (endDate.trim()) {
      const parsed = Date.parse(endDate.trim());
      if (Number.isNaN(parsed)) return setError('End date must use YYYY-MM-DD format.');
      endAt = Math.floor(parsed / 1000);
    }

    setBusy(true);
    const result = await recurringService.createSubscription({
      ...form,
      payee: form.payee.trim(),
      amount: form.amount.trim(),
      label: form.label.trim(),
      endAt,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    Alert.alert('Subscription created', 'Recurring payment is now active on Arc.');
    await onCreated();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Recurring Payment</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Input
            label="Label"
            value={form.label}
            onChangeText={(value) => setForm((current) => ({ ...current, label: value }))}
            placeholder="Monthly salary, payroll, rent"
          />
          <Input
            label="Recipient wallet"
            value={form.payee}
            onChangeText={(value) => setForm((current) => ({ ...current, payee: value }))}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label="Amount (USDC)"
            value={form.amount}
            onChangeText={(value) => setForm((current) => ({ ...current, amount: value }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <View style={{ gap: 10 }}>
            <Text style={styles.sectionLabel}>Frequency</Text>
            <View style={styles.intervalRow}>
              {INTERVAL_PRESETS.map((item) => (
                <TouchableOpacity
                  key={item.seconds}
                  style={[styles.intervalChip, form.interval === item.seconds && styles.intervalChipActive]}
                  onPress={() => setForm((current) => ({ ...current, interval: item.seconds }))}
                >
                  <Text style={[styles.intervalChipText, form.interval === item.seconds && styles.intervalChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Input
            label="Optional end date"
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            hint="Leave blank to keep it open-ended."
          />

          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>Execution notes</Text>
            <Text style={styles.infoText}>The first run will ask for a one-time USDC approval, then the subscription can execute on Arc with minimal fees.</Text>
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.modalFooter}>
          <Button label={busy ? 'Creating...' : 'Create Subscription'} onPress={handleSubmit} loading={busy} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function RecurringScreen() {
  const address = useWalletStore((state) => state.address);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'due'>('all');
  const [loadError, setLoadError] = useState('');
  const isMountedRef = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (!address) {
      if (!isMountedRef.current) return;
      setSubscriptions([]);
      setLoadError('Create or import a wallet before using recurring payments.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError('');

    let cached: Subscription[] = [];
    try {
      cached = await recurringService.loadCached(address);
      if (!isMountedRef.current) return;
      if (cached.length > 0) {
        setSubscriptions(cached);
      }

      const fresh = await withTimeout(
        recurringService.loadSubscriptions(address),
        12_000,
        'Loading recurring payments',
      );
      if (!isMountedRef.current) return;
      setSubscriptions(fresh);
    } catch (error: any) {
      if (!isMountedRef.current) return;
      if (cached.length === 0) {
        setSubscriptions([]);
      }
      setLoadError(error?.shortMessage ?? error?.message ?? 'Unable to load recurring payments. Pull to refresh.');
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => { isMountedRef.current = false; };
  }, [load]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((item) => {
      if (filter === 'active') return item.active;
      if (filter === 'due') return item.isDue;
      return true;
    });
  }, [filter, subscriptions]);

  const stats = useMemo(() => {
    const active = subscriptions.filter((item) => item.active).length;
    const due = subscriptions.filter((item) => item.isDue).length;
    const monthlyRunRate = subscriptions
      .filter((item) => item.active)
      .reduce((sum, item) => sum + (item.amount * 30 * 86_400) / item.interval, 0);

    return { active, due, monthlyRunRate };
  }, [subscriptions]);

  async function handleAction(id: number, action: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);

    if (!result.success) {
      Alert.alert('Action failed', result.error ?? 'Please try again.');
      return;
    }

    Alert.alert('Done', successMessage);
    await load(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
      >
        <View style={styles.heroRow}>
          <UtilityBackButton />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>Recurring</Text>
            <Text style={styles.subtitle}>Automate repeated USDC payments on Arc without leaving the wallet.</Text>
          </View>
          <TouchableOpacity style={[styles.addButton, !isRecurringConfigured() && styles.addButtonDisabled]} onPress={() => isRecurringConfigured() ? setShowCreate(true) : setLoadError('Recurring contract is not configured yet. Add EXPO_PUBLIC_RECURRING_ADDRESS first.')}>
            <Ionicons name="add" size={22} color={Colors.bg} />
          </TouchableOpacity>
        </View>

        {!isRecurringConfigured() ? (
          <Card style={styles.bannerCard}>
            <Ionicons name="warning-outline" size={18} color={Colors.warning} />
            <Text style={styles.bannerText}>Recurring contract is not configured yet. Add `EXPO_PUBLIC_RECURRING_ADDRESS` before using onchain creation.</Text>
          </Card>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard label="Active" value={String(stats.active)} accent={Colors.primary} />
          <StatCard label="Due now" value={String(stats.due)} accent={Colors.warning} />
          <StatCard label="Monthly" value={`$${stats.monthlyRunRate.toFixed(0)}`} accent={Colors.success} />
        </View>

        <View style={styles.filterRow}>
          <FilterPill label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterPill label="Active" active={filter === 'active'} onPress={() => setFilter('active')} />
          <FilterPill label="Due" active={filter === 'due'} onPress={() => setFilter('due')} />
        </View>

        {loadError ? (
          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Recurring sync paused</Text>
              <Text style={styles.errorBody}>{loadError}</Text>
            </View>
            <TouchableOpacity style={styles.retryButton} onPress={() => void load(true)}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading recurring payments...</Text>
          </View>
        ) : filteredSubscriptions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="repeat-outline" size={26} color={Colors.text3} />
            <Text style={styles.emptyTitle}>No recurring payments yet</Text>
            <Text style={styles.emptyText}>Create one to automate payroll, subscriptions, or any repeat transfer in USDC.</Text>
            <Button label={isRecurringConfigured() ? 'Create First Subscription' : 'Contract Not Configured'} disabled={!isRecurringConfigured()} onPress={() => setShowCreate(true)} style={{ marginTop: 8 }} />
          </Card>
        ) : (
          filteredSubscriptions.map((item) => (
            <SubscriptionCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onPause={() => handleAction(item.id, () => recurringService.pauseSubscription(item.id), 'Subscription paused.')}
              onResume={() => handleAction(item.id, () => recurringService.resumeSubscription(item.id), 'Subscription resumed.')}
              onTrigger={() => handleAction(item.id, () => recurringService.triggerPayment(item.id), 'Payment executed.')}
              onCancel={() =>
                Alert.alert('Cancel subscription?', 'This will stop future payments for this stream.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel subscription', style: 'destructive', onPress: () => handleAction(item.id, () => recurringService.cancelSubscription(item.id), 'Subscription cancelled.') },
                ])
              }
            />
          ))
        )}
      </ScrollView>

      <CreateRecurringModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={() => load(true)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 120 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { color: Colors.text1, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.45 },
  bannerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.warningBg },
  bannerText: { flex: 1, color: Colors.text1, fontSize: FontSize.sm, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, gap: 8 },
  statLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: FontSize.xl, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 10 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primaryDim },
  pillText: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '600' },
  pillTextActive: { color: Colors.primary },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 12 },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  errorTitle: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '800' },
  errorBody: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 18, marginTop: 2 },
  retryButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primaryDim },
  retryText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '700' },
  emptyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  subCard: { gap: 14 },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  subAvatarText: { fontSize: FontSize.lg, fontWeight: '800' },
  subTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  subMeta: { color: Colors.text2, fontSize: FontSize.xs },
  subAmount: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  subGridItem: {
    flexBasis: '47%',
    backgroundColor: Colors.elevated,
    borderRadius: Radius.md,
    padding: 12,
    gap: 4,
  },
  subGridLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase' },
  subGridValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700' },
  subGridHint: { color: Colors.text2, fontSize: FontSize.xs },
  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  modalBody: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
  sectionLabel: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '600' },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  intervalChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  intervalChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primaryDim },
  intervalChipText: { color: Colors.text2, fontSize: FontSize.sm, fontWeight: '600' },
  intervalChipTextActive: { color: Colors.primary },
  infoCard: { gap: 8, backgroundColor: Colors.elevated },
  infoTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700' },
  infoText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  modalFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
});

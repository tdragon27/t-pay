import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useSplitBills } from '@/hooks/useSplitBills';
import { buildSplitPaymentLink, cancelSplitBill, splitLifecycleStatus, splitProgress, type SplitBill } from '@/services/splitBillService';
import { shortenAddress } from '@/utils/format';
import { safeBack } from '@/utils/navigation';

const QR_SIZE = 224;

type SplitUiStatus = ReturnType<typeof splitLifecycleStatus>;

function statusCopy(status: SplitUiStatus) {
  if (status === 'partial') return 'Partial';
  if (status === 'complete') return 'Complete';
  if (status === 'expired') return 'Expired';
  if (status === 'cancelled') return 'Cancelled';
  return 'Open';
}

function expiryCopy(split: SplitBill) {
  if (!split.expiresAt) return 'No expiry';
  const expired = Date.now() > split.expiresAt;
  return `${expired ? 'Expired' : 'Expires'} ${new Date(split.expiresAt).toLocaleDateString()}`;
}

function shareAmount(split: SplitBill) {
  return split.participants[0]?.amountUsdc ?? '0.00';
}

export default function SplitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [busy, setBusy] = useState(false);
  const { allSplits, loading, error, refresh } = useSplitBills();
  const split = useMemo(() => allSplits.find((item) => item.id === params.id) ?? null, [allSplits, params.id]);
  const progress = split ? splitProgress(split) : null;
  const status = split ? splitLifecycleStatus(split) : 'open';
  const paymentLink = split ? buildSplitPaymentLink(split) : '';

  async function copyLink() {
    if (!paymentLink) return;
    await Clipboard.setStringAsync(paymentLink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Payment link copied' });
  }

  async function shareLink() {
    if (!split || !paymentLink) return;
    await Share.share({
      title: 'T Pay Split Bill',
      message: `${split.note ?? 'Split bill'}\nPay ${shareAmount(split)} USDC on Arc Testnet:\n${paymentLink}`,
    });
  }

  async function handleCancel() {
    if (!split) return;
    Alert.alert('Cancel split?', 'This will stop the split from accepting more payments.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel split',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await cancelSplitBill(split.id);
            await refresh();
            Toast.show({ type: 'success', text1: 'Split cancelled' });
          } catch (err: any) {
            Alert.alert('Unable to cancel', err?.message ?? 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Split Bill" onBack={() => safeBack(router)} />
        <View style={styles.content}>
          <SplitDetailLoading />
        </View>
      </SafeAreaView>
    );
  }

  if (!split) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Split Bill" onBack={() => safeBack(router)} />
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
          <Text style={styles.centerTitle}>Split bill not found</Text>
          <Text style={styles.centerText}>{error ?? 'This split may have expired, been cancelled, or is not synced on this device.'}</Text>
          <Button label="Back" onPress={() => safeBack(router)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Split Bill" onBack={() => safeBack(router)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={[styles.heroCard, (status === 'expired' || status === 'cancelled') && styles.mutedCard]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{split.note ?? 'Split bill'}</Text>
              <Text style={styles.heroSub}>Split Bill uses USDC on Arc Testnet.</Text>
            </View>
            <StatusPill status={status} />
          </View>

          <View style={styles.summaryGrid}>
            <Metric label="Total" value={`${split.totalUsdc} USDC`} />
            <Metric label="Each person" value={`${shareAmount(split)} USDC`} />
            <Metric label="People" value={String(split.peopleCount)} />
          </View>
        </Card>

        <Card style={styles.qrCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}><Ionicons name="qr-code-outline" size={18} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Share Payment Request</Text>
              <Text style={styles.sectionSub}>Anyone can scan this and pay their share.</Text>
            </View>
          </View>
          <View style={styles.qrShell}>
            <QRCode value={paymentLink} size={QR_SIZE} color={Colors.text1} backgroundColor={Colors.surface} />
          </View>
          <Text style={styles.linkText} numberOfLines={2}>{paymentLink}</Text>
          <View style={styles.actionGrid}>
            <Button label="Copy Link" onPress={copyLink} style={styles.actionButton} />
            <Button label="Share" variant="secondary" onPress={shareLink} style={styles.actionButton} />
          </View>
        </Card>

        <Card style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View>
              <Text style={styles.progressTitle}>Collected</Text>
              <Text style={styles.progressAmount}>{progress?.receivedUsdc ?? '0.00'} / {progress?.totalUsdc ?? split.totalUsdc} USDC</Text>
            </View>
            <Text style={styles.percentText}>{progress?.percent ?? 0}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress?.percent ?? 0}%` }]} /></View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{expiryCopy(split)}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>Receiver {shortenAddress(split.receiverWallet, 5)}</Text>
          </View>
        </Card>

        {(status === 'open' || status === 'partial') ? <Button label="Cancel Split" variant="ghost" loading={busy} onPress={handleCancel} /> : null}
        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SplitDetailLoading() {
  return (
    <Card style={styles.loadingCard}>
      <View style={styles.loadingHeaderRow}>
        <Skeleton style={styles.loadingIcon} />
        <View style={styles.loadingTextGroup}>
          <Skeleton style={styles.loadingTitle} />
          <Skeleton style={styles.loadingSub} />
        </View>
      </View>
      <Skeleton style={styles.loadingProgress} />
      <View style={styles.loadingActions}>
        <Skeleton style={styles.loadingButton} />
        <Skeleton style={styles.loadingButton} />
      </View>
    </Card>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.75}>
        <Ionicons name="arrow-back" size={22} color={Colors.text1} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 42 }} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: SplitUiStatus }) {
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md },
  loadingCard: { gap: 14, backgroundColor: 'rgba(255,255,255,0.045)', borderColor: 'rgba(255,255,255,0.08)' },
  loadingHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingIcon: { width: 42, height: 42, borderRadius: 14 },
  loadingTextGroup: { flex: 1, gap: 8 },
  loadingTitle: { width: '58%', height: 14, borderRadius: Radius.full },
  loadingSub: { width: '82%', height: 10, borderRadius: Radius.full },
  loadingProgress: { height: 9, borderRadius: Radius.full },
  loadingActions: { flexDirection: 'row', gap: 10 },
  loadingButton: { flex: 1, height: 42, borderRadius: Radius.lg },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: 12 },
  centerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  centerText: { color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  heroCard: { gap: 14, backgroundColor: 'rgba(255,255,255,0.045)' },
  mutedCard: { opacity: 0.75 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroTitle: { color: Colors.text1, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 4 },
  statusPill: { color: Colors.warning, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.warningBg, overflow: 'hidden' },
  statusPartial: { color: Colors.primary, backgroundColor: Colors.primaryGlow },
  statusComplete: { color: Colors.success, backgroundColor: Colors.successBg },
  statusMuted: { color: Colors.text3, backgroundColor: Colors.elevated },
  summaryGrid: { flexDirection: 'row', gap: 10 },
  metricBox: { flex: 1, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  metricLabel: { color: Colors.text3, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  metricValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '900', marginTop: 5 },
  qrCard: { gap: Spacing.md, alignItems: 'stretch' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)' },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '900' },
  sectionSub: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 3 },
  qrShell: { alignSelf: 'center', padding: 18, borderRadius: 28, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  linkText: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17, textAlign: 'center' },
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
  progressCard: { gap: 12 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  progressTitle: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.9 },
  progressAmount: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '900', marginTop: 5 },
  percentText: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: Radius.full, backgroundColor: Colors.elevated, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full, backgroundColor: Colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  metaText: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '700' },
  metaDot: { color: Colors.text3, fontSize: FontSize.xs },
});

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { formatUnits, type Hex } from 'viem';

import { MotionView } from '@/components/ui/MotionView';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { useBalance } from '@/hooks/useBalance';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { submitArcBatchUsdc } from '@/services/arcTransactionExtensions';
import { recordActivity } from '@/services/activityService';
import { recordNotification } from '@/services/notificationService';
import { addPendingTx, markPendingTx } from '@/services/pendingTxService';
import { createPaymentIntent, updatePaymentIntent } from '@/services/paymentIntentService';
import { useWalletStore } from '@/store/walletStore';
import { sanitizeDecimalInput, shortenHash } from '@/utils/format';
import { safeBack } from '@/utils/navigation';
import { safeOpenTx } from '@/utils/safeOpenUrl';
import { validateBatchDraft } from '@/utils/universalPayment';

interface PayoutRow {
  id: string;
  name: string;
  address: string;
  amount: string;
}

type ScreenStep = 'edit' | 'review' | 'result';

function makeRow(index: number): PayoutRow {
  return { id: `payout_${Date.now()}_${index}`, name: '', address: '', amount: '' };
}

function compactError(error: unknown) {
  return String((error as any)?.shortMessage ?? (error as any)?.message ?? 'Batch payout failed.')
    .split('\n')[0]
    .trim();
}

export default function BatchPayoutScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();
  const { address, tokenBalances } = useWalletStore();
  const { refetch } = useBalance();
  const [rows, setRows] = useState<PayoutRow[]>([makeRow(1), makeRow(2)]);
  const [batchNote, setBatchNote] = useState('');
  const [step, setStep] = useState<ScreenStep>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);

  const usdcBalance = tokenBalances.USDC;
  const validation = useMemo(
    () => validateBatchDraft(rows, usdcBalance?.raw ?? 0n),
    [rows, usdcBalance?.raw],
  );
  const total = formatUnits(validation.totalRaw, 6);

  function updateRow(id: string, patch: Partial<PayoutRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setError(null);
  }

  function addRow() {
    if (rows.length >= 20) return;
    setRows((current) => [...current, makeRow(current.length + 1)]);
    void Haptics.selectionAsync();
  }

  function removeRow(id: string) {
    if (rows.length <= 2) return;
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function submitBatch() {
    if (!validation.valid || busy || isOffline || !address) return;
    setBusy(true);
    setError(null);
    let intentId: string | null = null;
    let submittedHash: Hex | null = null;

    try {
      const intent = await createPaymentIntent({
        type: 'batch',
        amount: total,
        tokenSymbol: 'USDC',
        receiverWallet: rows[0].address as `0x${string}`,
        senderWallet: address,
        label: `Batch payout to ${rows.length} recipients`,
        note: batchNote.trim() || undefined,
        paymentPurpose: 'merchant_batch_payout',
        policyNote: 'All-or-nothing Arc Multicall3From batch; Transfer events verified after confirmation.',
      });
      intentId = intent.id;
      await updatePaymentIntent(intent.id, { status: 'awaiting_user_confirmation' });
      await updatePaymentIntent(intent.id, { status: 'submitting' });

      const result = await submitArcBatchUsdc({
        recipients: rows.map((row) => ({ address: row.address, amount: row.amount, label: row.name })),
        onSubmitted: async (hash) => {
          submittedHash = hash;
          setTxHash(hash);
          await updatePaymentIntent(intent.id, { status: 'submitted', txHash: hash });
          await addPendingTx({
            txHash: hash,
            type: 'batch',
            label: `Batch payout · ${rows.length} recipients`,
            explorerUrl: `${ARC_TESTNET_DEFAULTS.EXPLORER_URL}/tx/${hash}`,
            metadata: { amount: total, token: 'USDC', recipients: rows.length, paymentIntentId: intent.id },
          });
          await updatePaymentIntent(intent.id, { status: 'pending', txHash: hash });
          await recordActivity({
            id: `intent_${intent.id}`,
            type: 'batch',
            amount: total,
            token: 'USDC',
            direction: 'outgoing',
            status: 'pending',
            timestamp: Date.now(),
            txHash: hash,
            sourceFeature: 'batch',
            counterparty: `${rows.length} recipients`,
            label: `Batch payout · ${rows.length} recipients`,
            note: batchNote.trim() || undefined,
            paymentIntentId: intent.id,
          });
        },
      });

      await markPendingTx(result.txHash, 'confirmed');
      await updatePaymentIntent(intent.id, { status: 'confirmed', txHash: result.txHash, paidAt: Date.now() });
      await recordActivity({
        id: `intent_${intent.id}`,
        type: 'batch',
        amount: total,
        token: 'USDC',
        direction: 'outgoing',
        status: 'confirmed',
        timestamp: Date.now(),
        txHash: result.txHash,
        sourceFeature: 'batch',
        counterparty: `${rows.length} recipients`,
        label: `Batch payout · ${rows.length} recipients`,
        note: batchNote.trim() || undefined,
        paymentIntentId: intent.id,
        metadata: { eventVerified: true, recipientCount: rows.length },
      });
      void recordNotification({
        type: 'payment',
        title: 'Batch payout confirmed',
        message: `${total} USDC sent to ${rows.length} recipients.`,
        route: '/history',
        data: { txHash: result.txHash },
        silent: true,
      });
      setVerified(result.verified);
      setPending(false);
      setStep('result');
      await refetch();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      const message = compactError(caught);
      if (intentId && !submittedHash) {
        await updatePaymentIntent(intentId, { status: 'failed', failureReason: message });
      }
      if (submittedHash) {
        setPending(true);
        setStep('result');
        setError('Batch was submitted. Confirmation is pending; do not submit it again.');
      } else {
        setError(message);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'result') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.resultWrap}>
          <MotionView style={[styles.resultIcon, pending && styles.pendingIcon]}>
            <Ionicons name={pending ? 'time-outline' : 'checkmark'} size={34} color={pending ? Colors.warning : Colors.success} />
          </MotionView>
          <Text style={styles.resultTitle}>{pending ? 'Batch pending' : 'Batch payout complete'}</Text>
          <Text style={styles.resultDetail}>{total} USDC · {rows.length} recipients</Text>
          {verified ? (
            <View style={styles.verifiedPill}>
              <Ionicons name="shield-checkmark-outline" size={15} color={Colors.success} />
              <Text style={styles.verifiedText}>All Transfer events verified</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.pendingText}>{error}</Text> : null}
          {txHash ? (
            <TouchableOpacity style={styles.hashRow} onPress={() => void safeOpenTx(txHash)}>
              <Text style={styles.hashText}>{shortenHash(txHash, 8)}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)/merchant')}>
            <Text style={styles.primaryText}>Back to Business</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => step === 'review' ? setStep('edit') : safeBack(router)}>
            <Ionicons name="arrow-back" size={22} color={Colors.text1} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{step === 'review' ? 'Review batch' : 'Batch payouts'}</Text>
            <Text style={styles.headerSubtitle}>One Arc transaction · USDC only</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 'edit' ? (
            <>
              <MotionView style={styles.summaryCard}>
                <View>
                  <Text style={styles.summaryLabel}>Available</Text>
                  <Text style={styles.summaryValue}>{usdcBalance?.error ? '—' : usdcBalance?.formatted ?? '0.00'} USDC</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View>
                  <Text style={styles.summaryLabel}>Batch total</Text>
                  <Text style={styles.summaryValue}>{total} USDC</Text>
                </View>
              </MotionView>

              <MotionView delay={40} style={styles.infoStrip}>
                <Ionicons name="layers-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoText}>All payouts succeed together or the full transaction reverts.</Text>
              </MotionView>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recipients</Text>
                <Text style={styles.countText}>{rows.length}/20</Text>
              </View>
              {rows.map((row, index) => (
                <MotionView key={row.id} layout style={styles.recipientCard}>
                  <View style={styles.recipientTop}>
                    <Text style={styles.recipientTitle}>Recipient {index + 1}</Text>
                    {rows.length > 2 ? (
                      <TouchableOpacity onPress={() => removeRow(row.id)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={17} color={Colors.error} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Input label="Name (optional)" value={row.name} onChangeText={(name) => updateRow(row.id, { name })} placeholder="Team member" />
                  <Input label="Wallet" value={row.address} onChangeText={(value) => updateRow(row.id, { address: value })} placeholder="0x..." autoCapitalize="none" autoCorrect={false} />
                  <Input label="Amount (USDC)" value={row.amount} onChangeText={(value) => updateRow(row.id, { amount: sanitizeDecimalInput(value, 6) })} placeholder="0.00" keyboardType="decimal-pad" />
                </MotionView>
              ))}

              <TouchableOpacity style={styles.addButton} onPress={addRow} disabled={rows.length >= 20}>
                <Ionicons name="add" size={18} color={Colors.primary} />
                <Text style={styles.addText}>Add recipient</Text>
              </TouchableOpacity>
              <Input label="Batch note (optional)" value={batchNote} onChangeText={setBatchNote} placeholder="Payroll, refunds, rewards..." />

              {error || (!validation.valid && rows.some((row) => row.address || row.amount)) ? (
                <Text style={styles.errorText}>{error || validation.error}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryButton, (!validation.valid || isOffline || usdcBalance?.isLoading) && styles.disabled]}
                disabled={!validation.valid || isOffline || usdcBalance?.isLoading}
                onPress={() => { setError(null); setStep('review'); }}
              >
                <Text style={styles.primaryText}>Review batch</Text>
              </TouchableOpacity>
            </>
          ) : (
            <MotionView style={styles.reviewCard}>
              <Text style={styles.reviewEyebrow}>Batch total</Text>
              <Text style={styles.reviewAmount}>{total} USDC</Text>
              <Text style={styles.reviewCount}>{rows.length} recipients on Arc Testnet</Text>
              <View style={styles.reviewDivider} />
              {rows.map((row, index) => (
                <View key={row.id} style={styles.reviewRow}>
                  <View style={styles.reviewIndex}><Text style={styles.reviewIndexText}>{index + 1}</Text></View>
                  <View style={styles.reviewCopy}>
                    <Text style={styles.reviewName}>{row.name.trim() || `Recipient ${index + 1}`}</Text>
                    <Text style={styles.reviewAddress} numberOfLines={1}>{row.address}</Text>
                  </View>
                  <Text style={styles.reviewValue}>{row.amount} USDC</Text>
                </View>
              ))}
              <View style={styles.safetyStrip}>
                <Ionicons name="shield-checkmark-outline" size={17} color={Colors.success} />
                <Text style={styles.safetyText}>T Pay simulates every transfer and verifies every receipt event.</Text>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={submitBatch}>
                {busy ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryText}>Confirm batch payout</Text>}
              </TouchableOpacity>
            </MotionView>
          )}
          <View style={{ height: 44 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.text1, fontSize: FontSize.xl, fontWeight: '700' },
  headerSubtitle: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 2 },
  headerSpacer: { width: 42 },
  content: { padding: Spacing.md, gap: 14 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: Radius.xl, backgroundColor: '#10202A', borderWidth: 1, borderColor: 'rgba(53,213,244,0.14)' },
  summaryLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.7 },
  summaryValue: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '700', marginTop: 5 },
  summaryDivider: { width: 1, height: 42, backgroundColor: Colors.border, marginHorizontal: 22 },
  infoStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow },
  infoText: { flex: 1, color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '700' },
  countText: { color: Colors.text3, fontSize: FontSize.sm },
  recipientCard: { padding: 15, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 13 },
  recipientTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipientTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  addButton: { minHeight: 48, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.primaryDim },
  addText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, lineHeight: 19 },
  primaryButton: { minHeight: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { color: Colors.bg, fontSize: FontSize.md, fontWeight: '700' },
  disabled: { opacity: 0.42 },
  reviewCard: { padding: 18, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  reviewEyebrow: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  reviewAmount: { color: Colors.text1, fontSize: 34, fontWeight: '700', marginTop: 5 },
  reviewCount: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 5 },
  reviewDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 18 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  reviewIndex: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow },
  reviewIndexText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  reviewCopy: { flex: 1 },
  reviewName: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  reviewAddress: { color: Colors.text3, fontSize: 10.5, marginTop: 3 },
  reviewValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  safetyStrip: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.successBg, marginVertical: 14 },
  safetyText: { flex: 1, color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17 },
  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26 },
  resultIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.successBg, borderWidth: 1, borderColor: 'rgba(50,213,131,0.26)' },
  pendingIcon: { backgroundColor: Colors.warningBg, borderColor: 'rgba(253,176,34,0.26)' },
  resultTitle: { color: Colors.text1, fontSize: 26, fontWeight: '700', marginTop: 22 },
  resultDetail: { color: Colors.text2, fontSize: FontSize.md, marginTop: 8 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.successBg },
  verifiedText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600' },
  pendingText: { color: Colors.warning, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', marginTop: 16 },
  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 20, paddingHorizontal: 13, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: Colors.surface },
  hashText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
});

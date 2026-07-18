import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
import {
  SUPPORTED_ARC_TESTNET_TOKENS,
  getArcTestnetToken,
  type SupportedArcTokenSymbol,
} from '@/constants/tokens';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { useBalance } from '@/hooks/useBalance';
import { useMultiChainBalance } from '@/hooks/useMultiChainBalance';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSend } from '@/hooks/useSend';
import { isArcAppKitConfigured, spendUnifiedUsdcWithAppKit } from '@/lib/arcAppKit';
import { getPublicClient } from '@/lib/viemClient';
import { waitForSuccessfulReceipt } from '@/lib/transactionReceipt';
import { loadPrivateKey } from '@/lib/wallet';
import { submitArcMemoTransfer } from '@/services/arcTransactionExtensions';
import { addPendingTx, markPendingTx } from '@/services/pendingTxService';
import { createPaymentIntent, updatePaymentIntent } from '@/services/paymentIntentService';
import { recordActivity } from '@/services/activityService';
import { recordNotification } from '@/services/notificationService';
import { ensureCriticalAuth } from '@/services/securityService';
import { useWalletStore } from '@/store/walletStore';
import {
  decimalInputToBigInt,
  getDecimalInputError,
  isValidAddress,
  sanitizeDecimalInput,
  shortenAddress,
  shortenHash,
} from '@/utils/format';
import { safeBack } from '@/utils/navigation';
import { safeOpenTx } from '@/utils/safeOpenUrl';
import { buildUniversalPaymentPlan } from '@/utils/universalPayment';

type ScreenStep = 'edit' | 'review' | 'result';
type ResultState = 'confirmed' | 'pending';

function compactError(error: unknown) {
  const value = (error as any)?.shortMessage ?? (error as any)?.message ?? 'Payment could not be completed.';
  return String(value).split('\n')[0].trim();
}

export default function UniversalPayScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();
  const { address, tokenBalances } = useWalletStore();
  const { refetch } = useBalance();
  const unified = useMultiChainBalance(address);
  const { sendToken, status: directStatus } = useSend();

  const [step, setStep] = useState<ScreenStep>('edit');
  const [selectedToken, setSelectedToken] = useState<SupportedArcTokenSymbol>('USDC');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memoEnabled, setMemoEnabled] = useState(false);
  const [reference, setReference] = useState('');
  const [publicMemo, setPublicMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [resultState, setResultState] = useState<ResultState>('confirmed');
  const [verified, setVerified] = useState(false);

  const token = getArcTestnetToken(selectedToken);
  const selectedBalance = tokenBalances[selectedToken];
  const amountError = getDecimalInputError(amount, token.decimals);
  const amountRaw = decimalInputToBigInt(amount, token.decimals);
  const unifiedUsdcRaw = useMemo(
    () => unified.balances.reduce((sum, item) => sum + (item.error ? 0n : item.rawBalance), 0n),
    [unified.balances],
  );
  const hasAlternativeArcBalance = SUPPORTED_ARC_TESTNET_TOKENS.some(
    (item) => item.symbol !== selectedToken && (tokenBalances[item.symbol]?.raw ?? 0n) > 0n,
  );
  const plan = buildUniversalPaymentPlan({
    tokenSymbol: selectedToken,
    amountRaw,
    arcBalanceRaw: selectedBalance?.raw ?? 0n,
    unifiedUsdcRaw,
    unifiedConfigured: isArcAppKitConfigured() && unified.source === 'APP_KIT_UNIFIED_BALANCE',
    memoRequested: memoEnabled,
    hasAlternativeArcBalance,
  });
  const formReady =
    !isOffline &&
    isValidAddress(recipient) &&
    Boolean(amountRaw) &&
    !amountError &&
    (!memoEnabled || reference.trim().length > 0);

  function resetResult() {
    setTxHash(null);
    setVerified(false);
    setError(null);
    setStep('edit');
    setAmount('');
  }

  async function recordSubmitted(input: {
    intentId: string;
    hash: Hex;
    route: string;
  }) {
    setTxHash(input.hash);
    await updatePaymentIntent(input.intentId, { status: 'submitted', txHash: input.hash });
    await addPendingTx({
      txHash: input.hash,
      type: 'send',
      label: `Pay ${amount} ${selectedToken}`,
      explorerUrl: `${ARC_TESTNET_DEFAULTS.EXPLORER_URL}/tx/${input.hash}`,
      metadata: {
        to: recipient,
        amount,
        token: selectedToken,
        route: input.route,
        paymentIntentId: input.intentId,
      },
    });
    await updatePaymentIntent(input.intentId, { status: 'pending', txHash: input.hash });
    await recordActivity({
      id: `intent_${input.intentId}`,
      type: 'send',
      amount,
      token: selectedToken,
      direction: 'outgoing',
      status: 'pending',
      timestamp: Date.now(),
      txHash: input.hash,
      sourceFeature: 'send',
      counterparty: recipient,
      label: `Pay ${amount} ${selectedToken}`,
      note: publicMemo.trim() || undefined,
      paymentIntentId: input.intentId,
      metadata: { paymentRoute: input.route, memoReference: reference.trim() || undefined },
    });
  }

  async function recordConfirmed(intentId: string, hash: Hex, route: string) {
    await markPendingTx(hash, 'confirmed');
    await updatePaymentIntent(intentId, { status: 'confirmed', txHash: hash, paidAt: Date.now() });
    await recordActivity({
      id: `intent_${intentId}`,
      type: 'send',
      amount,
      token: selectedToken,
      direction: 'outgoing',
      status: 'confirmed',
      timestamp: Date.now(),
      txHash: hash,
      sourceFeature: 'send',
      counterparty: recipient,
      label: `Pay ${amount} ${selectedToken}`,
      note: publicMemo.trim() || undefined,
      paymentIntentId: intentId,
      metadata: { paymentRoute: route, eventVerified: route === 'memo' },
    });
    void recordNotification({
      type: 'payment',
      title: 'Payment confirmed',
      message: `${amount} ${selectedToken} settled on Arc Testnet.`,
      route: '/history',
      data: { txHash: hash },
      silent: true,
    });
  }

  async function executeManagedRoute(route: 'memo' | 'unified_balance') {
    let intentId: string | null = null;
    let submittedHash: Hex | null = null;
    try {
      const intent = await createPaymentIntent({
        type: 'transfer',
        amount,
        tokenSymbol: selectedToken,
        receiverWallet: recipient as `0x${string}`,
        senderWallet: address ?? undefined,
        label: `Pay ${amount} ${selectedToken}`,
        note: publicMemo.trim() || undefined,
        paymentPurpose: reference.trim() || 'wallet_payment',
        policyNote: route === 'memo' ? 'Public memo verified from Arc receipt.' : 'User-confirmed Unified Balance spend.',
      });
      intentId = intent.id;
      await updatePaymentIntent(intent.id, { status: 'awaiting_user_confirmation' });
      await updatePaymentIntent(intent.id, { status: 'submitting' });

      if (route === 'memo') {
        const result = await submitArcMemoTransfer({
          recipient,
          amount,
          tokenSymbol: selectedToken,
          reference: reference.trim(),
          publicMemo: publicMemo.trim() || reference.trim(),
          onSubmitted: async (hash) => {
            submittedHash = hash;
            await recordSubmitted({ intentId: intent.id, hash, route });
          },
        });
        setVerified(result.verified);
        await recordConfirmed(intent.id, result.txHash, route);
        setResultState('confirmed');
      } else {
        const unlocked = await ensureCriticalAuth();
        if (!unlocked) throw new Error('Unlock T Pay before continuing.');
        const privateKey = await loadPrivateKey();
        if (!privateKey) throw new Error('Wallet not found.');
        const hash = await spendUnifiedUsdcWithAppKit({
          privateKey,
          amountUsdc: amount.replace(',', '.'),
          recipientAddress: recipient,
        }) as Hex;
        submittedHash = hash;
        await recordSubmitted({ intentId: intent.id, hash, route });
        await waitForSuccessfulReceipt(getPublicClient(), hash);
        await recordConfirmed(intent.id, hash, route);
        setResultState('confirmed');
      }
      await refetch();
      setStep('result');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      const message = compactError(caught);
      if (intentId && !submittedHash) {
        await updatePaymentIntent(intentId, { status: 'failed', failureReason: message });
      }
      if (intentId && submittedHash) {
        setResultState('pending');
        setStep('result');
        setError('Payment was submitted. Confirmation is still pending; do not submit it again.');
        return;
      }
      setError(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function confirmPayment() {
    if (!formReady || !plan.canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (plan.route === 'direct') {
        const result = await sendToken(recipient, amount.replace(',', '.'), { tokenSymbol: selectedToken });
        if (result.status !== 'success') throw new Error(result.error || 'Payment failed.');
        setTxHash(result.txHash as Hex);
        setResultState('confirmed');
        await refetch();
        setStep('result');
      } else if (plan.route === 'memo' || plan.route === 'unified_balance') {
        await executeManagedRoute(plan.route);
      }
    } catch (caught) {
      setError(compactError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'result') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.resultWrap}>
          <MotionView style={[styles.resultIcon, resultState === 'pending' && styles.resultPending]}>
            <Ionicons
              name={resultState === 'confirmed' ? 'checkmark' : 'time-outline'}
              size={34}
              color={resultState === 'confirmed' ? Colors.success : Colors.warning}
            />
          </MotionView>
          <Text style={styles.resultTitle}>{resultState === 'confirmed' ? 'Payment confirmed' : 'Confirmation pending'}</Text>
          <Text style={styles.resultDetail}>
            {amount} {selectedToken} to {shortenAddress(recipient, 6)}
          </Text>
          {verified ? (
            <View style={styles.verifiedPill}>
              <Ionicons name="shield-checkmark-outline" size={15} color={Colors.success} />
              <Text style={styles.verifiedText}>Memo and transfer events verified</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.pendingCopy}>{error}</Text> : null}
          {txHash ? (
            <TouchableOpacity style={styles.hashRow} onPress={() => void safeOpenTx(txHash)}>
              <Text style={styles.hashText}>{shortenHash(txHash, 8)}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.primaryButton} onPress={resetResult}>
            <Text style={styles.primaryButtonText}>Make another payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
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
            <Text style={styles.headerTitle}>{step === 'review' ? 'Review payment' : 'Pay'}</Text>
            <Text style={styles.headerSubtitle}>Arc Testnet · user-confirmed execution</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 'edit' ? (
            <>
              <MotionView delay={30}>
                <Text style={styles.sectionLabel}>Asset</Text>
                <View style={styles.tokenRow}>
                  {SUPPORTED_ARC_TESTNET_TOKENS.map((item) => {
                    const active = item.symbol === selectedToken;
                    const balance = tokenBalances[item.symbol];
                    return (
                      <TouchableOpacity
                        key={item.symbol}
                        style={[styles.tokenChip, active && { borderColor: item.accent, backgroundColor: `${item.accent}12` }]}
                        onPress={() => { setSelectedToken(item.symbol); setAmount(''); setError(null); }}
                      >
                        <Text style={[styles.tokenSymbol, active && { color: item.accent }]} numberOfLines={1}>{item.symbol}</Text>
                        <Text style={styles.tokenBalance}>{balance?.error ? '—' : balance?.formatted ?? '0'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </MotionView>

              <MotionView delay={60} style={styles.formCard}>
                <Input
                  label="To"
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder="Wallet address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={recipient && !isValidAddress(recipient) ? 'Enter a valid 0x address' : undefined}
                />
                <Input
                  label={`Amount (${selectedToken})`}
                  value={amount}
                  onChangeText={(value) => setAmount(sanitizeDecimalInput(value, token.decimals))}
                  placeholder={selectedToken === 'cirBTC' ? '0.0001' : '0.00'}
                  keyboardType="decimal-pad"
                  error={amountError ?? undefined}
                  hint={`Available: ${selectedBalance?.error ? '—' : selectedBalance?.formatted ?? '0'} ${selectedToken}`}
                  rightIcon={<Text style={styles.maxText}>MAX</Text>}
                  onRightIconPress={() => {
                    if (selectedBalance?.raw && selectedBalance.raw > 0n) {
                      setAmount(formatUnits(selectedBalance.raw, token.decimals));
                    }
                  }}
                />
              </MotionView>

              <MotionView delay={90} style={styles.memoCard}>
                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <View style={styles.memoTitleRow}>
                      <Ionicons name="document-text-outline" size={17} color={Colors.primary} />
                      <Text style={styles.memoTitle}>Onchain payment memo</Text>
                    </View>
                    <Text style={styles.memoDetail}>Optional and public. Useful for order or invoice reconciliation.</Text>
                  </View>
                  <Switch value={memoEnabled} onValueChange={setMemoEnabled} trackColor={{ true: Colors.primaryDim }} />
                </View>
                {memoEnabled ? (
                  <View style={styles.memoFields}>
                    <Input label="Reference" value={reference} onChangeText={setReference} placeholder="order-2026-001" />
                    <Input label="Public note" value={publicMemo} onChangeText={setPublicMemo} placeholder="Optional payment description" />
                  </View>
                ) : null}
              </MotionView>

              <MotionView delay={120} style={styles.routeCard}>
                <View style={styles.routeIcon}>
                  <Ionicons
                    name={plan.route === 'unified_balance' ? 'layers-outline' : plan.route === 'memo' ? 'document-text-outline' : 'flash-outline'}
                    size={18}
                    color={plan.canSubmit ? Colors.primary : Colors.warning}
                  />
                </View>
                <View style={styles.routeCopy}>
                  <Text style={styles.routeTitle}>{plan.title}</Text>
                  <Text style={styles.routeDetail}>{plan.detail}</Text>
                </View>
              </MotionView>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {plan.route === 'swap_first' ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/fx')}>
                  <Text style={styles.primaryButtonText}>Open Swap</Text>
                </TouchableOpacity>
              ) : plan.route === 'insufficient' ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/faucet')}>
                  <Text style={styles.primaryButtonText}>Get test assets</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, (!formReady || !plan.canSubmit) && styles.buttonDisabled]}
                  disabled={!formReady || !plan.canSubmit}
                  onPress={() => { setError(null); setStep('review'); }}
                >
                  <Text style={styles.primaryButtonText}>Review payment</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <MotionView style={styles.reviewCard}>
              <Text style={styles.reviewEyebrow}>You pay</Text>
              <Text style={styles.reviewAmount}>{amount} {selectedToken}</Text>
              <View style={styles.reviewDivider} />
              <View style={styles.reviewRow}><Text style={styles.reviewLabel}>To</Text><Text style={styles.reviewValue}>{shortenAddress(recipient, 7)}</Text></View>
              <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Route</Text><Text style={styles.reviewValue}>{plan.title}</Text></View>
              <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Network</Text><Text style={styles.reviewValue}>Arc Testnet</Text></View>
              {memoEnabled ? <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Public reference</Text><Text style={styles.reviewValue}>{reference}</Text></View> : null}
              <View style={styles.safetyStrip}>
                <Ionicons name="shield-checkmark-outline" size={17} color={Colors.success} />
                <Text style={styles.safetyText}>Simulation and receipt checks run before T Pay confirms this payment.</Text>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={[styles.primaryButton, busy && styles.buttonDisabled]} disabled={busy} onPress={confirmPayment}>
                {busy || directStatus === 'confirming' ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryButtonText}>Confirm payment</Text>}
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
  content: { padding: Spacing.md, gap: 16 },
  sectionLabel: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  tokenRow: { flexDirection: 'row', gap: 8 },
  tokenChip: { flex: 1, minWidth: 0, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center' },
  tokenSymbol: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700' },
  tokenBalance: { color: Colors.text3, fontSize: 10.5, marginTop: 4 },
  formCard: { padding: 16, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 16 },
  maxText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  memoCard: { padding: 15, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1 },
  memoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memoTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '600' },
  memoDetail: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17, marginTop: 5 },
  memoFields: { gap: 14, marginTop: 16 },
  routeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, backgroundColor: '#0D171E', borderWidth: 1, borderColor: 'rgba(53,213,244,0.12)' },
  routeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow },
  routeCopy: { flex: 1 },
  routeTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  routeDetail: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17, marginTop: 3 },
  primaryButton: { minHeight: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, paddingHorizontal: 18 },
  primaryButtonText: { color: Colors.bg, fontSize: FontSize.md, fontWeight: '700' },
  secondaryButton: { minHeight: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, marginTop: 10 },
  secondaryButtonText: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '600' },
  buttonDisabled: { opacity: 0.42 },
  errorText: { color: Colors.error, fontSize: FontSize.sm, lineHeight: 19, paddingHorizontal: 2 },
  reviewCard: { padding: 20, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  reviewEyebrow: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  reviewAmount: { color: Colors.text1, fontSize: 34, lineHeight: 42, fontWeight: '700', marginTop: 7 },
  reviewDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 20 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 15 },
  reviewLabel: { color: Colors.text3, fontSize: FontSize.sm },
  reviewValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'right', flex: 1 },
  safetyStrip: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.successBg, marginTop: 4, marginBottom: 18 },
  safetyText: { flex: 1, color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17 },
  resultWrap: { flex: 1, padding: 26, alignItems: 'center', justifyContent: 'center' },
  resultIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.successBg, borderWidth: 1, borderColor: 'rgba(50,213,131,0.26)' },
  resultPending: { backgroundColor: Colors.warningBg, borderColor: 'rgba(253,176,34,0.26)' },
  resultTitle: { color: Colors.text1, fontSize: 26, fontWeight: '700', marginTop: 22 },
  resultDetail: { color: Colors.text2, fontSize: FontSize.md, marginTop: 8, textAlign: 'center' },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.successBg },
  verifiedText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600' },
  pendingCopy: { color: Colors.warning, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', marginTop: 16 },
  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 20, paddingHorizontal: 13, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: Colors.surface },
  hashText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
});

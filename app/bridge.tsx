// app/bridge.tsx
// Cross-chain USDC bridge: Arc -> Base / Ethereum / Arbitrum / Polygon.
// Arc docs used: https://docs.arc.io/app-kit/bridge
// Execution goes through Circle App Kit with no synthetic quote fallback.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useWalletStore } from '@/store/walletStore';
import { arcTestnet, BRIDGE_CHAINS, type BridgeChain } from '@/constants/chains';
import { bridgeUsdcWithAppKit, getBridgeStatus, getUsdcBridgeQuote, type BridgeQuote } from '@/lib/arcAppKit';
import { loadPrivateKey } from '@/lib/wallet';
import {
  sanitizeAmount,
  isValidAmount,
  isValidAddress,
  parseUsdc,
  shortenAddress,
  shortenHash,
} from '@/utils/format';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '@/constants/theme';
import { useMultiChainBalance } from '@/hooks/useMultiChainBalance';
import { notifyBridgeSubmitted } from '@/services/notificationService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ensureCriticalAuth } from '@/services/securityService';
import { safeOpenTx } from '@/utils/safeOpenUrl';

// --- Types --------------------------------------------------------------------

type BridgeStatus = 'idle' | 'signing' | 'bridging' | 'attesting' | 'minting' | 'success' | 'error';
type Step = 'input' | 'confirm' | 'progress' | 'done';
type BridgeDirection = 'fromArc' | 'toArc';

const STATUS_STEPS: Array<{ key: BridgeStatus; label: string; icon: string }> = [
  { key: 'signing',   label: 'Approving transaction',   icon: 'pencil-outline' },
  { key: 'bridging',  label: 'Burning USDC on source',     icon: 'flame-outline' },
  { key: 'attesting', label: 'Circle CCTP attestation', icon: 'shield-outline' },
  { key: 'minting',   label: 'Minting on destination',  icon: 'add-circle-outline' },
  { key: 'success',   label: 'Bridge complete!',        icon: 'checkmark-circle-outline' },
];

// --- Screen -------------------------------------------------------------------

export default function BridgeScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();
  const params = useLocalSearchParams<{ amount?: string; destAddress?: string; sourceChainId?: string; direction?: string; returnInvoiceId?: string }>();
  const { usdcBalanceFormatted, address } = useWalletStore();
  const { balances } = useMultiChainBalance(address);
  const initialSourceChain = Number(params.sourceChainId ?? 0);
  const initialDirection: BridgeDirection = params.direction === 'toArc' || initialSourceChain > 0 ? 'toArc' : 'fromArc';
  const initialChain = BRIDGE_CHAINS.find((chain) => chain.id === initialSourceChain) ?? BRIDGE_CHAINS[0];

  const [step, setStep]                     = useState<Step>('input');
  const [direction, setDirection]           = useState<BridgeDirection>(initialDirection);
  const [selectedChain, setSelectedChain]   = useState<BridgeChain>(initialChain);
  const [showChainPicker, setShowChainPicker] = useState(false);
  const [amount, setAmount]                 = useState(String(params.amount ?? ''));
  const [destAddress, setDestAddress]       = useState(String(params.destAddress ?? address ?? ''));
  const [amountError, setAmountError]       = useState('');
  const [addrError, setAddrError]           = useState('');

  // Bridge state
  const [bridgeStatus, setBridgeStatus]     = useState<BridgeStatus>('idle');
  const [txHash, setTxHash]                 = useState<string | null>(null);
  const [bridgeError, setBridgeError]       = useState<string | null>(null);
  const [bridgeQuote, setBridgeQuote]       = useState<BridgeQuote | null>(null);

  const isLoading = ['signing', 'bridging', 'attesting', 'minting'].includes(bridgeStatus);
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === bridgeStatus);
  const sourceChainId = direction === 'fromArc' ? arcTestnet.id : selectedChain.id;
  const destinationChainId = direction === 'fromArc' ? selectedChain.id : arcTestnet.id;
  const sourceLabel = direction === 'fromArc' ? 'Arc Testnet' : selectedChain.name;
  const destinationLabel = direction === 'fromArc' ? selectedChain.name : 'Arc Testnet';
  const selectedExternalBalance = balances.find((item) => item.chainId === selectedChain.id);

  React.useEffect(() => {
    if (!destAddress && address) {
      setDestAddress(address);
    }
  }, [address, destAddress]);

  // -- Validation -----------------------------------------------------------
  function validate(): boolean {
    let ok = true;
    const bal = direction === 'fromArc'
      ? parseFloat(usdcBalanceFormatted.replace(/,/g, '')) || 0
      : parseFloat((selectedExternalBalance?.balance ?? '0').replace(/,/g, '')) || 0;
    if (!isValidAmount(amount) || Number(amount) <= 0) {
      setAmountError('Enter a valid amount'); ok = false;
    } else if (Number(amount) > bal) {
      setAmountError(`Insufficient balance (${usdcBalanceFormatted} USDC)`); ok = false;
    } else setAmountError('');

    if (!isValidAddress(destAddress)) {
      setAddrError('Enter a valid 0x destination address'); ok = false;
    } else setAddrError('');
    return ok;
  }

  // -- Get quote -> move to confirm ------------------------------------------
  const handleGetQuote = useCallback(async () => {
    if (isOffline) { setBridgeError('No internet connection - bridge is disabled in read-only mode.'); return; }
    if (!validate()) return;
    setBridgeError(null);

    try {
      if (isOffline) throw new Error('No internet connection - bridge is disabled in read-only mode.');
      const unlocked = await ensureCriticalAuth();
      if (!unlocked) throw new Error('PIN or biometric unlock is required before bridging.');
      const pk = await loadPrivateKey();
      const quote = await getUsdcBridgeQuote({
        sourceChainId,
        destinationChainId,
        amountUsdc: parseUsdc(amount),
        privateKey: pk ?? undefined,
        destinationAddress: destAddress,
      });
      setBridgeQuote(quote);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStep('confirm');
    } catch (error: any) {
      setBridgeQuote(null);
      setBridgeError(error?.message ?? 'Could not fetch bridge quote.');
      setStep('input');
    }
  }, [amount, destAddress, selectedChain.id, usdcBalanceFormatted, direction, sourceChainId, destinationChainId, selectedExternalBalance?.balance]);

  const handleBridge = useCallback(async () => {
    setBridgeError(null);
    setTxHash(null);
    setStep('progress');

    try {
      if (isOffline) throw new Error('No internet connection - bridge is disabled in read-only mode.');
      const unlocked = await ensureCriticalAuth();
      if (!unlocked) throw new Error('PIN or biometric unlock is required before bridging.');
      const pk = await loadPrivateKey();
      if (!pk) throw new Error('Wallet not found. Please create or import a wallet first.');

      setBridgeStatus('signing');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setBridgeStatus('bridging');
      const hash = await bridgeUsdcWithAppKit({
        privateKey: pk,
        sourceChainId,
        destinationChainId,
        destinationAddress: destAddress,
        amountUsdc: parseUsdc(amount),
      });

      setTxHash(hash);

      await notifyBridgeSubmitted(hash, params.returnInvoiceId);

      const status = await getBridgeStatus(hash);

      if (status.status === 'failed') {

        throw new Error(status.message ?? 'Bridge failed.');

      }

      if (status.status === 'complete') {

        setBridgeStatus('success');

        setStep('done');

        Toast.show({ type: 'success', text1: 'Bridge complete', text2: shortenHash(hash) });

      } else {

        setBridgeStatus('attesting');

        Toast.show({ type: 'info', text1: 'Bridge submitted', text2: 'Waiting for Circle attestation.' });

      }
    } catch (error: any) {
      const message = error?.shortMessage ?? error?.message ?? 'Bridge failed. Please try again.';
      setBridgeError(message);
      setBridgeStatus('error');
      setStep('confirm');
      Toast.show({ type: 'error', text1: 'Bridge failed', text2: message });
    }
  }, [amount, destAddress, selectedChain.id, sourceChainId, destinationChainId]);

  function handleReset() {
    setBridgeStatus('idle');
    setTxHash(null);
    setBridgeError(null);
    setBridgeQuote(null);
    setAmount('');
    setStep('input');
  }

  // -- Estimated output -----------------------------------------------------
  const estimatedOut = bridgeQuote
    ? (Number(bridgeQuote.amountOut) / 1e6).toFixed(6)
    : isValidAmount(amount) ? Number(amount).toFixed(6) : '0';

  // -------------------------------------------------------------------------
  // RENDER STEPS
  // -------------------------------------------------------------------------

  const renderInput = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.directionCard}>
          <Text style={styles.pickerTitle}>Bridge Direction</Text>
          <View style={styles.directionRow}>
            {(['fromArc', 'toArc'] as const).map((nextDirection) => (
              <TouchableOpacity
                key={nextDirection}
                style={[styles.directionBtn, direction === nextDirection && styles.directionBtnActive]}
                onPress={() => {
                  setDirection(nextDirection);
                  setBridgeQuote(null);
                  setBridgeError(null);
                  if (nextDirection === 'toArc' && address) setDestAddress(address);
                }}
              >
                <Text style={[styles.directionText, direction === nextDirection && styles.directionTextActive]}>
                  {nextDirection === 'fromArc' ? 'Arc -> Chain' : 'Chain -> Arc'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Route visual */}
        <View style={styles.routeRow}>
          {direction === 'fromArc' ? (
            <View style={styles.chainChip}>
              <Text style={styles.chainChipEmoji}>ARC</Text>
              <Text style={styles.chainChipName}>Arc Testnet</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.chainChip, styles.chainChipActive]}
              onPress={() => setShowChainPicker((s) => !s)}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <Text style={styles.chainChipEmoji}>{selectedChain.logo}</Text>
              <Text style={styles.chainChipName}>{selectedChain.name}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
          {direction === 'fromArc' ? (
            <TouchableOpacity
              style={[styles.chainChip, styles.chainChipActive]}
              onPress={() => setShowChainPicker((s) => !s)}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <Text style={styles.chainChipEmoji}>{selectedChain.logo}</Text>
              <Text style={styles.chainChipName}>{selectedChain.name}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.chainChip}>
              <Text style={styles.chainChipEmoji}>ARC</Text>
              <Text style={styles.chainChipName}>Arc Testnet</Text>
            </View>
          )}
        </View>

        {/* Chain picker */}
        {showChainPicker && (
          <Card style={styles.chainPickerCard}>
            <Text style={styles.pickerTitle}>{direction === 'fromArc' ? 'Select Destination Chain' : 'Select Source Chain'}</Text>
            {BRIDGE_CHAINS.map((chain) => (
              <TouchableOpacity
                key={chain.id}
                style={[styles.chainOption, selectedChain.id === chain.id && styles.chainOptionActive]}
                onPress={() => { setSelectedChain(chain); setShowChainPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.chainEmoji}>{chain.logo}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chainOptionName}>{chain.name}</Text>
                  <Text style={styles.chainOptionSub}>Chain ID: {chain.id}</Text>
                </View>
                {selectedChain.id === chain.id && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Amount */}
        <Input
          label="Amount (USDC)"
          value={amount}
          onChangeText={(t) => { setAmount(sanitizeAmount(t)); setAmountError(''); }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={amountError}
          rightIcon={
            <TouchableOpacity
              onPress={() => setAmount(direction === 'fromArc' ? usdcBalanceFormatted.replace(/,/g, '') : selectedExternalBalance?.balance.replace(/,/g, '') ?? '')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.primary }}>MAX</Text>
            </TouchableOpacity>
          }
          hint={`Source balance: $${direction === 'fromArc' ? usdcBalanceFormatted : selectedExternalBalance?.balance ?? '0.00'}`}
        />

        {/* Destination */}
        <Input
          label={`Destination on ${destinationLabel}`}
          value={destAddress}
          onChangeText={(t) => { setDestAddress(t.trim()); setAddrError(''); }}
          placeholder="0x..."
          autoCapitalize="none"
          autoCorrect={false}
          error={addrError}
          hint="Defaults to your wallet address"
        />

        {/* CCTP info badge */}
        {bridgeError && (
          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{bridgeError}</Text>
          </Card>
        )}

        <Card style={styles.cctpCard}>
          <View style={styles.cctpRow}>
            <Text style={styles.cctpBadge}>CCTP</Text>
            <Text style={styles.cctpTitle}>Circle Cross-Chain Transfer Protocol</Text>
          </View>
          <Text style={styles.cctpDesc}>
            Native USDC bridge - no wrapped tokens, no slippage.
            Funds arrive as native USDC on destination, usually in seconds on testnet.
          </Text>
        </Card>

        <Button
          label="Get Quote"
          disabled={!amount || !destAddress || isOffline}
          onPress={handleGetQuote}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderConfirm = () => (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Quote hero */}
      <View style={styles.quoteHero}>
        <Text style={styles.quoteYouSend}>You send</Text>
        <Text style={styles.quoteAmount}>${amount}</Text>
        <Ionicons name="arrow-down" size={24} color={Colors.text3} />
        <Text style={styles.quoteYouSend}>They receive</Text>
        <Text style={[styles.quoteAmount, { color: Colors.success }]}>
          ~${estimatedOut} USDC
        </Text>
      </View>

      {/* Summary card */}
      <Card style={styles.quoteCard}>
        <QuoteRow label="From"        value={sourceLabel} />
        <QuoteRow label="To"          value={destinationLabel} />
        <QuoteRow label="Destination" value={shortenAddress(destAddress, 6)} mono />
        <View style={styles.divider} />
        <QuoteRow label="You send"    value={`$${amount} USDC`} />
        <QuoteRow label="They receive" value={`~$${estimatedOut} USDC`} highlight />
        <QuoteRow label="Bridge fee"  value={bridgeQuote ? `${bridgeQuote.feeUsd} USDC` : 'Unavailable'} />
        <QuoteRow label="Gas"         value={direction === 'fromArc' ? 'Paid in Arc USDC' : 'Paid on source chain'} />
        <QuoteRow label="Est. time"   value={`${bridgeQuote?.estimatedTimeSeconds ?? 30}s`} />
      </Card>

      {bridgeError && (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
          <Text style={styles.errorText}>{bridgeError}</Text>
        </Card>
      )}

      <Button
        label={isOffline ? 'Offline - Bridge Disabled' : 'Confirm & Bridge'}
        onPress={handleBridge}
        loading={isLoading}
        disabled={isLoading || !bridgeQuote || isOffline}
      />
      <Button
        label="Go Back"
        variant="ghost"
        disabled={isLoading}
        onPress={() => setStep('input')}
      />
    </ScrollView>
  );

  const renderProgress = () => (
    <View style={styles.progressContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.progressTitle}>Bridging...</Text>
      <Text style={styles.progressSub}>Keep the app open</Text>

      <View style={styles.progressSteps}>
        {STATUS_STEPS.filter((s) => s.key !== 'success').map((s, i) => {
          const isDone   = i < currentStepIndex;
          const isActive = i === currentStepIndex;
          return (
            <View key={s.key} style={styles.progressStep}>
              <View style={[styles.stepCircle, isDone && styles.stepDone, isActive && styles.stepActive]}>
                <Ionicons
                  name={(isDone ? 'checkmark' : s.icon) as any}
                  size={18}
                  color={isDone ? Colors.bg : isActive ? Colors.primary : Colors.text3}
                />
              </View>
              <Text style={[
                styles.stepLabel,
                isDone && styles.stepLabelDone,
                isActive && styles.stepLabelActive,
              ]}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderDone = () => (
    <View style={styles.doneContainer}>
      <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
      <Text style={styles.doneTitle}>Bridge Submitted</Text>
      <Text style={styles.doneAmount}>${amount} USDC</Text>
      <Text style={styles.doneSub}>to {destinationLabel}</Text>
      {txHash && (
        <TouchableOpacity
          style={styles.explorerLink}
          onPress={() =>
            void safeOpenTx(txHash)
          }
        >
          <Text style={styles.explorerText}>{shortenHash(txHash)}</Text>
          <Ionicons name="open-outline" size={14} color={Colors.primary} />
        </TouchableOpacity>
      )}
      <Button
        label={params.returnInvoiceId ? "Return to Pay" : "Done"}
        onPress={() => { const invoiceId = params.returnInvoiceId; handleReset(); invoiceId ? router.replace({ pathname: '/pay' as any, params: { invoiceId } }) : safeBack(router); }}
        style={{ width: '100%', marginTop: Spacing.lg }}
      />
    </View>
  );

  // -- Main render ----------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'input' || step === 'done') safeBack(router);
            else setStep('input');
          }}
          style={styles.closeBtn}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 16 }}
        >
          <Ionicons
            name={step === 'input' || step === 'done' ? 'close' : 'arrow-back'}
            size={24}
            color={Colors.text1}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'done'     ? 'Bridged'
           : step === 'progress' ? 'Bridging...'
           : step === 'confirm'  ? 'Confirm Bridge'
           :                      'Bridge USDC'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'input'    && renderInput()}
      {step === 'confirm'  && renderConfirm()}
      {step === 'progress' && renderProgress()}
      {step === 'done'     && renderDone()}
    </SafeAreaView>
  );
}

// --- QuoteRow -----------------------------------------------------------------

function QuoteRow({ label, value, mono, highlight }: {
  label: string; value: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <View style={qStyles.row}>
      <Text style={qStyles.label}>{label}</Text>
      <Text style={[qStyles.value, mono && qStyles.mono, highlight && qStyles.highlight]}>
        {value}
      </Text>
    </View>
  );
}

const qStyles = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  label:     { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.text2 },
  value:     { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.text1 },
  mono:      { fontFamily: FontFamily.mono, fontSize: FontSize.xs },
  highlight: { color: Colors.primary, fontFamily: FontFamily.bodySemiBold },
});

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn:    { padding: 8, width: 40 },
  headerTitle: { fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.lg, color: Colors.text1 },
  content:     { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  directionCard: { gap: 10 },
  directionRow: { flexDirection: 'row', gap: 8 },
  directionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.full,
    alignItems: 'center',
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  directionBtnActive: { borderColor: Colors.primaryDim, backgroundColor: Colors.primaryGlow },
  directionText: { color: Colors.text2, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  directionTextActive: { color: Colors.primary },
  // Route row
  routeRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm,
  },
  chainChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.elevated, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: Colors.border,
  },
  chainChipActive:  { borderColor: Colors.primaryDim, backgroundColor: Colors.primaryGlow },
  chainChipEmoji:   { fontSize: 18 },
  chainChipName:    { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.text1 },

  // Chain picker
  chainPickerCard:  { gap: 4 },
  pickerTitle:      { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.text2, marginBottom: 8 },
  chainOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: Radius.md,
  },
  chainOptionActive: { backgroundColor: Colors.primaryGlow },
  chainEmoji:        { fontSize: 24 },
  chainOptionName:   { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.md, color: Colors.text1 },
  chainOptionSub:    { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.text3 },

  // CCTP info
  cctpCard:  { gap: 8 },
  cctpRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cctpBadge: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.bg,
    backgroundColor: Colors.primary, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 4, letterSpacing: 0.5,
  },
  cctpTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.text1 },
  cctpDesc:  { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.text2, lineHeight: 18 },

  // Confirm
  quoteHero: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 6 },
  quoteYouSend: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.text3 },
  quoteAmount:  { fontFamily: FontFamily.displayBold, fontSize: 40, color: Colors.text1, letterSpacing: -1.5 },
  quoteCard:    { gap: 2 },
  divider:      { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  errorCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.errorBg, borderColor: Colors.error,
  },
  errorText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.error, flex: 1 },

  // Progress
  progressContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.lg, gap: Spacing.lg,
  },
  progressTitle: { fontFamily: FontFamily.displayBold, fontSize: FontSize.xxl, color: Colors.text1 },
  progressSub:   { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.text3 },
  progressSteps: { width: '100%', gap: 16 },
  progressStep:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.elevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  stepDone:        { backgroundColor: Colors.success, borderColor: Colors.success },
  stepActive:      { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  stepLabel:       { fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.text3, flex: 1 },
  stepLabelDone:   { color: Colors.text2, textDecorationLine: 'line-through' },
  stepLabelActive: { color: Colors.primary, fontFamily: FontFamily.bodySemiBold },

  // Done
  doneContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.lg, gap: 12,
  },
  doneTitle:  { fontFamily: FontFamily.displayBold, fontSize: FontSize.hero, color: Colors.text1 },
  doneAmount: { fontFamily: FontFamily.displayBold, fontSize: FontSize.xxl, color: Colors.success },
  doneSub:    { fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.text2 },
  explorerLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.elevated, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  explorerText: { fontSize: FontSize.xs, color: Colors.primary, fontFamily: FontFamily.mono },
});











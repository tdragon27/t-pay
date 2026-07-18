// app/send.tsx
// -----------------------------------------------------------------------------
// Multi-asset Arc Testnet send modal: token picker, contact picker, confirmation,
// status feedback, and real ERC-20 transfer execution for configured assets.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Keyboard,
  InputAccessoryView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatUnits } from 'viem';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MotionView } from '@/components/ui/MotionView';
import { useSend } from '@/hooks/useSend';
import { useBalance } from '@/hooks/useBalance';
import { useWalletStore } from '@/store/walletStore';
import { decimalInputToBigInt, getDecimalInputError, isValidAddress, sanitizeDecimalInput, shortenAddress, shortenHash } from '@/utils/format';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '@/constants/theme';
import { SUPPORTED_ARC_TESTNET_TOKENS, isSupportedArcTokenSymbol, type SupportedArcTokenSymbol } from '@/constants/tokens';
import { loadContacts, TPayContact } from '@/services/contactService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { safeOpenTx } from '@/utils/safeOpenUrl';
import { recordSplitPayment } from '@/services/splitBillService';

type Step = 'input' | 'confirm' | 'result';
type AssetPickerMode = 'initial' | 'change' | null;

function maxAmountForSelectedToken(raw: bigint | null | undefined, decimals: number, fallback?: string) {
  if (raw != null) {
    return formatUnits(raw, decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }
  return (fallback ?? '0').replace(/,/g, '');
}

export default function SendScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address?: string; amount?: string; token?: string; splitId?: string; participantId?: string }>();
  useBalance();

  const { address, tokenBalances } = useWalletStore();
  const { sendToken, status, txHash, error, reset } = useSend();
  const { isOffline } = useNetworkStatus();

  const initialToken: SupportedArcTokenSymbol = isSupportedArcTokenSymbol(params.token) && !params.splitId ? params.token : 'USDC';
  const [selectedAsset, setSelectedAsset] = useState<SupportedArcTokenSymbol>(initialToken);
  const [assetPickerMode, setAssetPickerMode] = useState<AssetPickerMode>(
    params.token || params.splitId ? null : 'initial',
  );
  const [assetQuery, setAssetQuery] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [addressError, setAddressError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [contacts, setContacts] = useState<TPayContact[]>([]);
  const [sendCooldown, setSendCooldown] = useState(false);
  const [pendingSlow, setPendingSlow] = useState(false);

  const isLoading = ['signing', 'broadcasting', 'confirming'].includes(status);
  const scannedTokens = useMemo(
    () => params.splitId ? SUPPORTED_ARC_TESTNET_TOKENS.filter((token) => token.symbol === 'USDC') : SUPPORTED_ARC_TESTNET_TOKENS,
    [params.splitId],
  );
  const tokenOptions = useMemo(
    () => scannedTokens.filter((token) => (tokenBalances[token.symbol]?.raw ?? 0n) > 0n),
    [scannedTokens, tokenBalances],
  );
  const assetScanLoading = scannedTokens.some((token) => tokenBalances[token.symbol]?.isLoading)
    || scannedTokens.every((token) => tokenBalances[token.symbol]?.raw == null && !tokenBalances[token.symbol]?.error);
  const selectedToken = tokenOptions.find((token) => token.symbol === selectedAsset)
    ?? tokenOptions[0]
    ?? SUPPORTED_ARC_TESTNET_TOKENS.find((token) => token.symbol === selectedAsset)
    ?? SUPPORTED_ARC_TESTNET_TOKENS[0];
  const selectedBalance = tokenBalances[selectedToken.symbol];
  const filteredTokenOptions = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    if (!query) return tokenOptions;
    return tokenOptions.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query),
    );
  }, [assetQuery, tokenOptions]);
  const amountInputError = getDecimalInputError(amount, selectedToken.decimals);
  const amountRaw = decimalInputToBigInt(amount, selectedToken.decimals);
  const selectedContact = contacts.find((item) => item.address.toLowerCase() === toAddress.toLowerCase());
  const hasRecipient = toAddress.trim().length > 0;
  const hasValidRecipient = isValidAddress(toAddress);
  const hasPositiveAmount = Boolean(amountRaw && amountRaw > 0n);
  const reviewButtonLabel = useMemo(() => {
    if (isOffline) return 'Offline';
    if (tokenOptions.length === 0) return 'No assets to send';
    if (!hasRecipient) return 'Enter recipient';
    if (!hasValidRecipient) return 'Check recipient';
    if (!amount || !hasPositiveAmount) return 'Enter amount';
    if (amountInputError) return 'Check amount';
    if (selectedBalance?.isLoading) return 'Loading balance';
    if (selectedBalance?.error) return 'Balance unavailable';
    if ((selectedBalance?.raw ?? 0n) <= 0n) return 'No balance';
    if (amountRaw && selectedBalance?.raw != null && amountRaw > selectedBalance.raw) return 'Insufficient balance';
    return 'Review Send';
  }, [amount, amountInputError, amountRaw, hasPositiveAmount, hasRecipient, hasValidRecipient, isOffline, selectedBalance?.error, selectedBalance?.isLoading, selectedBalance?.raw, tokenOptions.length]);
  const reviewDisabled = reviewButtonLabel !== 'Review Send';


  useEffect(() => {
    if (params.address && typeof params.address === 'string') setToAddress(params.address);
    if (params.amount && typeof params.amount === 'string') setAmount(params.amount);
    if (isSupportedArcTokenSymbol(params.token) && !params.splitId) {
      setSelectedAsset(params.token);
      setAssetPickerMode(null);
    }
    if (params.splitId) setAssetPickerMode(null);
  }, [params.address, params.amount, params.token, params.splitId]);

  useEffect(() => { void loadContacts().then(setContacts); }, []);

  useEffect(() => {
    if (tokenOptions.length === 0) return;
    if (!tokenOptions.some((token) => token.symbol === selectedAsset)) {
      setSelectedAsset(tokenOptions[0].symbol);
      setAmountError('');
    }
  }, [tokenOptions, selectedAsset]);

  useEffect(() => {
    if (status !== 'confirming') {
      setPendingSlow(false);
      return;
    }
    const timer = setTimeout(() => setPendingSlow(true), 30_000);
    return () => clearTimeout(timer);
  }, [status]);

  const handlePasteRecipient = useCallback(async () => {
    const pasted = (await Clipboard.getStringAsync()).trim();
    if (!pasted) return;
    setToAddress(pasted);
    setAddressError(isValidAddress(pasted) ? '' : 'Enter a valid 0x EVM address');
    Haptics.selectionAsync();
  }, []);

  const validate = useCallback(() => {
    let ok = true;
    if (isOffline) {
      setAddressError('No internet connection - sending is disabled in read-only mode');
      return false;
    }
    if (!isValidAddress(toAddress)) {
      setAddressError('Enter a valid 0x EVM address');
      ok = false;
    } else {
      setAddressError('');
    }
    if (tokenOptions.length === 0) {
      setAmountError('No transferable Arc Testnet assets found');
      ok = false;
    } else if (amountInputError) {
      setAmountError(amountInputError);
      ok = false;
    } else if (!amountRaw || amountRaw <= 0n) {
      setAmountError('Enter a valid amount');
      ok = false;
    } else if (selectedBalance?.isLoading) {
      setAmountError(`${selectedAsset} balance is still loading`);
      ok = false;
    } else if (selectedBalance?.error) {
      setAmountError(`Unable to load ${selectedAsset} balance`);
      ok = false;
    } else if ((selectedBalance?.raw ?? 0n) <= 0n) {
      setAmountError(`No ${selectedAsset} balance available`);
      ok = false;
    } else if (selectedBalance?.raw != null && amountRaw > selectedBalance.raw) {
      setAmountError(`Insufficient ${selectedAsset} balance`);
      ok = false;
    } else {
      setAmountError('');
    }
    return ok;
  }, [isOffline, toAddress, amountInputError, amountRaw, selectedAsset, selectedBalance?.isLoading, selectedBalance?.error, selectedBalance?.raw, tokenOptions.length]);

  const handleReview = () => {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('confirm');
  };

  const handleSend = async () => {
    if (sendCooldown || isLoading || isOffline || tokenOptions.length === 0) return;
    setSendCooldown(true);
    setTimeout(() => setSendCooldown(false), 3_000);
    const result = await sendToken(toAddress, amount, { tokenSymbol: selectedAsset });
    if (result.status === 'success') {
      if (params.splitId && amount && selectedAsset === 'USDC') {
        try {
          await recordSplitPayment({
            splitId: String(params.splitId),
            participantId: params.participantId ? String(params.participantId) : undefined,
            amountUsdc: amount,
            txHash: result.txHash || undefined,
            payerWallet: address ?? undefined,
          });
        } catch {
          Toast.show({
            type: 'info',
            text1: 'Payment sent',
            text2: 'Split sync is pending receipt verification.',
          });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('result');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDone = () => {
    reset();
    safeBack(router);
  };

  const chooseAsset = (symbol: SupportedArcTokenSymbol) => {
    setSelectedAsset(symbol);
    setAmount('');
    setAmountError('');
    setAssetQuery('');
    setAssetPickerMode(null);
    void Haptics.selectionAsync();
  };

  const renderAssetPicker = () => {
    if (assetScanLoading && tokenOptions.length === 0) {
      return (
        <View style={styles.assetPickerState}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.assetPickerStateTitle}>Scanning your assets</Text>
          <Text style={styles.assetPickerStateText}>Checking transferable balances on Arc Testnet.</Text>
        </View>
      );
    }

    if (tokenOptions.length === 0) {
      return (
        <View style={styles.assetPickerState}>
          <View style={styles.assetPickerEmptyIcon}>
            <Ionicons name="wallet-outline" size={23} color={Colors.text3} />
          </View>
          <Text style={styles.assetPickerStateTitle}>No assets available to send</Text>
          <Text style={styles.assetPickerStateText}>Only assets with a confirmed Arc Testnet balance appear here.</Text>
          <TouchableOpacity style={styles.faucetButton} activeOpacity={0.8} onPress={() => router.push('/faucet' as any)}>
            <Text style={styles.faucetButtonText}>Get test assets</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.assetPickerContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.assetSearchBox}>
          <Ionicons name="search-outline" size={19} color={Colors.text3} />
          <TextInput
            value={assetQuery}
            onChangeText={setAssetQuery}
            placeholder="Search assets"
            placeholderTextColor={Colors.text3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            style={styles.assetSearchInput}
          />
        </View>

        <Text style={styles.assetListLabel}>Assets with balance</Text>
        <View style={styles.assetList}>
          {filteredTokenOptions.map((token, index) => {
            const balance = tokenBalances[token.symbol];
            return (
              <View key={token.symbol}>
                {index > 0 ? <View style={styles.assetRowDivider} /> : null}
                <TouchableOpacity
                  style={styles.assetRow}
                  onPress={() => chooseAsset(token.symbol)}
                  activeOpacity={0.72}
                >
                  <View style={[styles.assetIcon, { backgroundColor: `${token.accent}16` }]}>
                    <Text style={[styles.assetIconText, { color: token.accent }]}>{token.iconLabel}</Text>
                  </View>
                  <View style={styles.assetRowCopy}>
                    <Text style={styles.assetSymbol}>{token.symbol}</Text>
                    <Text style={styles.assetName}>{token.name}</Text>
                  </View>
                  <View style={styles.assetRowRight}>
                    <Text style={styles.assetRowBalance}>{balance?.formatted ?? '0'}</Text>
                    <Text style={styles.assetNetwork}>Arc Testnet</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={Colors.text3} />
                </TouchableOpacity>
              </View>
            );
          })}
          {filteredTokenOptions.length === 0 ? (
            <View style={styles.noSearchResult}>
              <Text style={styles.assetPickerStateText}>No matching asset with a balance.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  };

  const renderSelectedAsset = () => (
    <View style={styles.selectedAssetBlock}>
      <Text style={styles.fieldLabel}>Asset</Text>
      <TouchableOpacity
        style={styles.selectedAssetRow}
        activeOpacity={params.splitId ? 1 : 0.72}
        onPress={() => {
          if (!params.splitId) setAssetPickerMode('change');
        }}
        disabled={Boolean(params.splitId)}
      >
        <View style={[styles.selectedAssetIcon, { backgroundColor: `${selectedToken.accent}16` }]}>
          <Text style={[styles.assetIconText, { color: selectedToken.accent }]}>{selectedToken.iconLabel}</Text>
        </View>
        <View style={styles.selectedAssetCopy}>
          <Text style={styles.selectedAssetSymbol}>{selectedToken.symbol}</Text>
          <Text style={styles.selectedAssetName}>{selectedToken.name}</Text>
        </View>
        <View style={styles.selectedAssetRight}>
          <Text style={styles.selectedAssetBalance}>{selectedBalance?.formatted ?? '0'}</Text>
          <Text style={styles.selectedAssetAvailable}>Available</Text>
        </View>
        {!params.splitId ? <Ionicons name="chevron-forward" size={18} color={Colors.text3} /> : null}
      </TouchableOpacity>
      {params.splitId ? <Text style={styles.splitNotice}>Split Bill uses USDC on Arc Testnet.</Text> : null}
    </View>
  );

  const renderContacts = () => {
    const recent = contacts.slice(0, 4);
    return (
      <View style={styles.contactsMiniWrap}>
        <View style={styles.contactsMiniHeader}>
          <TouchableOpacity style={styles.contactsMiniTitle} onPress={() => router.push({ pathname: '/contacts' as any, params: { pick: '1' } })} activeOpacity={0.82}>
            <Ionicons name="people-outline" size={16} color={Colors.primary} />
            <Text style={styles.contactsMiniText}>Contacts / Address book</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/contacts' as any)} activeOpacity={0.82}>
            <Text style={styles.contactsManage}>Manage</Text>
          </TouchableOpacity>
        </View>
        {recent.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactRailCompact}>
            {recent.map((contact) => {
              const active = contact.address.toLowerCase() === toAddress.toLowerCase();
              return (
                <TouchableOpacity key={contact.id} style={[styles.contactPill, active && styles.contactPillActive]} onPress={() => { setToAddress(contact.address); setAddressError(''); }} activeOpacity={0.82}>
                  <View style={[styles.contactDot, { backgroundColor: contact.avatarColor }]} />
                  <Text style={styles.contactPillText} numberOfLines={1}>{contact.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
    );
  };

  const renderInput = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {renderSelectedAsset()}

        {tokenOptions.length > 0 ? (
          <>
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>To</Text>
                {selectedContact ? <Text style={styles.savedContactText}>{selectedContact.name}</Text> : null}
              </View>
              <View style={[styles.recipientBox, (addressError || (hasRecipient && !hasValidRecipient)) ? styles.recipientBoxError : null]}>
                <TextInput
                  value={toAddress}
                  onChangeText={(t) => { setToAddress(t.trim()); setAddressError(''); }}
                  placeholder="Wallet address or contact"
                  placeholderTextColor={Colors.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  returnKeyType="next"
                  selectionColor={Colors.primary}
                  style={styles.recipientInput}
                />
                <View style={styles.recipientActions}>
                  <TouchableOpacity onPress={handlePasteRecipient} style={styles.recipientIconBtn} activeOpacity={0.78}>
                    <Ionicons name="clipboard-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/scan')} style={styles.recipientIconBtn} activeOpacity={0.78}>
                    <Ionicons name="scan-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {(addressError || (hasRecipient && !hasValidRecipient)) ? <Text style={styles.inlineErrorText}>{addressError || 'Enter a valid 0x EVM address'}</Text> : null}
              {renderContacts()}
            </View>

            <Card style={styles.amountCard}>
              <View style={styles.amountCardHeader}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <View style={[styles.assetBadge, { borderColor: selectedToken.accent + '55', backgroundColor: selectedToken.accent + '17' }]}>
                  <Text style={[styles.assetBadgeText, { color: selectedToken.accent }]} numberOfLines={1}>{selectedAsset}</Text>
                </View>
              </View>
              <View style={[styles.walletAmountRow, amountError ? styles.amountRowError : null]}>
                <TextInput
                  value={amount}
                  onChangeText={(t) => { setAmount(sanitizeDecimalInput(t, selectedToken.decimals)); setAmountError(''); }}
                  placeholder={selectedAsset === 'cirBTC' ? '0.0001' : '0.00'}
                  placeholderTextColor={Colors.text3}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'send-amount-done' : undefined}
                  selectionColor={Colors.primary}
                  style={styles.walletAmountInput}
                />
                <Text style={styles.walletAmountSymbol} numberOfLines={1}>{selectedAsset}</Text>
              </View>
              {Platform.OS === 'ios' ? (
                <InputAccessoryView nativeID="send-amount-done">
                  <View style={styles.accessoryBar}>
                    <TouchableOpacity style={styles.accessoryDone} onPress={Keyboard.dismiss} activeOpacity={0.75}>
                      <Text style={styles.accessoryDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              ) : null}
              {(amountError || amountInputError) ? <Text style={styles.inlineErrorText}>{amountError || amountInputError}</Text> : null}
              <View style={styles.balanceMaxRow}>
                <Text style={styles.availableText}>Available: {selectedBalance?.isLoading ? 'Loading...' : selectedBalance?.error ? 'Unavailable ' + selectedAsset : (selectedBalance?.formatted ?? '0.00') + ' ' + selectedAsset}</Text>
                <TouchableOpacity onPress={() => setAmount(maxAmountForSelectedToken(selectedBalance?.raw, selectedToken.decimals, selectedBalance?.formatted))} activeOpacity={0.78}>
                  <Text style={styles.maxAction}>MAX</Text>
                </TouchableOpacity>
              </View>
            </Card>

            <View style={[styles.feeInline, isOffline && styles.feeInlineOffline]}>
              <Ionicons name={isOffline ? 'cloud-offline-outline' : 'flash-outline'} size={15} color={isOffline ? Colors.warning : Colors.primary} />
              <Text style={[styles.feeInlineText, isOffline && { color: Colors.warning }]}>
                {isOffline ? 'Read-only mode - reconnect to send' : 'Arc Testnet fee paid in native USDC'}
              </Text>
            </View>

            <Button label={reviewButtonLabel} disabled={reviewDisabled} onPress={handleReview} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderConfirm = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.confirmHero}>
        <Text style={styles.confirmAmount}>{amount}</Text>
        <Text style={styles.confirmCurrency}>{selectedAsset}</Text>
      </View>

      <Card style={styles.confirmCard}>
        <ConfirmRow label="From" value={shortenAddress(address ?? '', 6)} />
        <View style={styles.confirmArrow}><Ionicons name="arrow-down" size={16} color={Colors.text3} /></View>
        <ConfirmRow label="To" value={selectedContact ? `${selectedContact.name} (${shortenAddress(toAddress, 5)})` : shortenAddress(toAddress, 6)} mono={!selectedContact} />
        <View style={styles.confirmDivider} />
        <ConfirmRow label="Amount" value={`${amount} ${selectedAsset}`} highlight />
        <ConfirmRow label="Network Fee" value="Paid in native USDC" green />
        <ConfirmRow label="Network" value="Arc Testnet" />
        {params.splitId ? <ConfirmRow label="Split bill" value={params.participantId ? 'Auto-mark this person paid' : 'Auto-record payment'} green /> : null}
      </Card>

      {pendingSlow && txHash ? (
        <Card style={styles.pendingCard}>
          <Ionicons name="time-outline" size={18} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>Transaction is still pending</Text>
            <Text style={styles.pendingText}>You can keep waiting or open the Arc explorer to check status.</Text>
            <TouchableOpacity onPress={() => void safeOpenTx(txHash)}>
              <Text style={styles.pendingLink}>Open explorer</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : null}

      {error ? <Card style={styles.errorCard}><Ionicons name="alert-circle-outline" size={18} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></Card> : null}

      <Button label={isLoading ? statusLabel(status) : sendCooldown ? 'Please wait...' : 'Confirm Send'} loading={isLoading} disabled={sendCooldown || isOffline} onPress={handleSend} />
      <Button label="Go Back" variant="ghost" disabled={isLoading} onPress={() => { reset(); setStep('input'); }} />
    </ScrollView>
  );

  const renderResult = () => (
    <View style={styles.resultContainer}>
      <View style={styles.successIcon}><Ionicons name="checkmark-circle" size={72} color={Colors.success} /></View>
      <Text style={styles.resultTitle}>Sent!</Text>
      <Text style={styles.resultAmount}>{amount} {selectedAsset}</Text>
      <Text style={styles.resultSub}>to {selectedContact?.name ?? shortenAddress(toAddress, 6)}</Text>
      {txHash ? (
        <TouchableOpacity style={styles.explorerLink} onPress={() => void safeOpenTx(txHash)}>
          <Text style={styles.explorerText}>{shortenHash(txHash)}</Text>
          <Ionicons name="open-outline" size={14} color={Colors.primary} />
        </TouchableOpacity>
      ) : null}
      <Button label="Done" onPress={handleDone} style={styles.doneBtn} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'input' && assetPickerMode === 'change') {
              setAssetPickerMode(null);
              return;
            }
            if (step === 'input') {
              safeBack(router);
              return;
            }
            setStep('input');
          }}
          style={styles.backBtn}
        >
          <Ionicons
            name={step === 'input' && assetPickerMode !== 'change' ? 'close' : 'arrow-back'}
            size={24}
            color={Colors.text1}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'input' && assetPickerMode
            ? 'Select asset'
            : step === 'input'
              ? `Send ${selectedAsset}`
              : step === 'confirm'
                ? 'Confirm Send'
                : 'Complete'}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      {step === 'input' && assetPickerMode ? (
        <MotionView key="asset-picker" variant="fade" style={styles.stage}>
          {renderAssetPicker()}
        </MotionView>
      ) : null}
      {step === 'input' && !assetPickerMode ? (
        <MotionView key="send-input" style={styles.stage}>
          {renderInput()}
        </MotionView>
      ) : null}
      {step === 'confirm' ? (
        <MotionView key="send-confirm" style={styles.stage}>
          {renderConfirm()}
        </MotionView>
      ) : null}
      {step === 'result' ? (
        <MotionView key="send-result" variant="fade" style={styles.stage}>
          {renderResult()}
        </MotionView>
      ) : null}
    </SafeAreaView>
  );
}

function ConfirmRow({ label, value, mono, highlight, green }: { label: string; value: string; mono?: boolean; highlight?: boolean; green?: boolean }) {
  return <View style={confirmStyles.row}><Text style={confirmStyles.label}>{label}</Text><Text style={[confirmStyles.value, mono && confirmStyles.mono, highlight && confirmStyles.highlight, green && confirmStyles.green]}>{value}</Text></View>;
}

const confirmStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: 12 },
  label: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.text2 },
  value: { flex: 1, textAlign: 'right', fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.text1 },
  mono: { fontFamily: FontFamily.mono, fontSize: FontSize.xs },
  highlight: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.text1 },
  green: { color: Colors.success },
});

function statusLabel(status: string): string {
  switch (status) {
    case 'signing': return 'Unlocking...';
    case 'broadcasting': return 'Sending...';
    case 'confirming': return 'Confirming...';
    default: return 'Processing...';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  stage: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 8, width: 40 },
  headerTitle: { fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.lg, color: Colors.text1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  assetPickerContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
  assetSearchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  assetSearchInput: { flex: 1, minHeight: 50, color: Colors.text1, fontFamily: FontFamily.body, fontSize: FontSize.md },
  assetListLabel: { color: Colors.text2, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, marginTop: 2 },
  assetList: {
    overflow: 'hidden',
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  assetRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14 },
  assetRowDivider: { height: 1, marginLeft: 66, backgroundColor: Colors.border },
  assetIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assetIconText: { fontFamily: FontFamily.displayBold, fontSize: 12 },
  assetRowCopy: { flex: 1 },
  assetSymbol: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  assetName: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 3 },
  assetRowRight: { alignItems: 'flex-end', minWidth: 72 },
  assetRowBalance: { color: Colors.text1, fontFamily: FontFamily.mono, fontSize: FontSize.sm },
  assetNetwork: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: 10, marginTop: 3 },
  noSearchResult: { minHeight: 72, alignItems: 'center', justifyContent: 'center', padding: 14 },
  assetPickerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 9 },
  assetPickerEmptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevated,
    marginBottom: 4,
  },
  assetPickerStateTitle: { color: Colors.text1, fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.lg, textAlign: 'center' },
  assetPickerStateText: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 19, textAlign: 'center' },
  faucetButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.full, backgroundColor: Colors.primary },
  faucetButtonText: { color: Colors.bg, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  selectedAssetBlock: { gap: 8 },
  selectedAssetRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedAssetIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  selectedAssetCopy: { flex: 1 },
  selectedAssetSymbol: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  selectedAssetName: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  selectedAssetRight: { alignItems: 'flex-end' },
  selectedAssetBalance: { color: Colors.text1, fontFamily: FontFamily.mono, fontSize: FontSize.sm },
  selectedAssetAvailable: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: 10, marginTop: 2 },
  amountSection: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 10 },
  assetScanCard: { width: '100%', alignItems: 'center', gap: 7, padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  assetScanTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  assetScanText: { color: Colors.text3, fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17 },
  assetScanLink: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '900', marginTop: 2 },
  tokenSelector: { flexDirection: 'row', gap: 8, flexWrap: 'nowrap', justifyContent: 'center', marginBottom: 2 },
  tokenChip: { flex: 1, minWidth: 0, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.elevated, paddingHorizontal: 8, paddingVertical: 9 },
  tokenChipActive: { shadowColor: Colors.primary, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  tokenChipText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '900', letterSpacing: 0.2, maxWidth: '100%' },
  tokenChipBalance: { color: Colors.text3, fontSize: 9, fontWeight: '700', marginTop: 2, maxWidth: '100%' },
  splitNotice: { color: Colors.text3, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, marginBottom: 4 },
  amountLabel: { fontSize: FontSize.sm, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  amountRow: { minWidth: 220, maxWidth: '92%', minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, borderRadius: Radius.xl, backgroundColor: 'rgba(26,26,38,0.55)', borderWidth: 1, borderColor: Colors.border },
  amountRowError: { borderColor: Colors.error },
  dollarSign: { fontSize: 38, fontWeight: '300', color: Colors.text3, lineHeight: 48 },
  amountInput: { width: 180, minWidth: 112, maxWidth: 220, height: 64, textAlign: 'center', fontSize: 42, fontWeight: '800', color: Colors.text1, letterSpacing: -1.2, paddingVertical: 0 },
  accessoryBar: { minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#141722', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  accessoryDone: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: 'rgba(0,212,255,0.14)' },
  accessoryDoneText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700' },
  amountErrorText: { color: Colors.error, fontSize: FontSize.xs, marginTop: 2 },
  maxBtn: { paddingVertical: 6 },
  maxBtnText: { fontSize: FontSize.xs, color: Colors.primary },
  contactsCard: { gap: 12, paddingVertical: 14 },
  contactsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contactsTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  contactsManage: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  emptyContact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  emptyContactText: { color: Colors.text2, fontSize: FontSize.sm },
  contactRail: { gap: 10, paddingRight: 6 },
  contactChip: { width: 78, alignItems: 'center', gap: 7, padding: 8, borderRadius: Radius.lg, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  contactChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  contactAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  contactAvatarText: { fontSize: 15, fontWeight: '800' },
  contactName: { color: Colors.text1, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  matchText: { marginTop: -8, color: Colors.success, fontSize: FontSize.xs, fontWeight: '800' },
  feeCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.successBg, borderColor: 'rgba(0,232,143,0.3)' },
  offlineCard: { backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.3)' },
  feeTitle: { fontSize: FontSize.sm, color: Colors.success, fontWeight: '600' },
  feeSub: { fontSize: FontSize.xs, color: Colors.text3 },
  fieldBlock: { gap: 8 },
  fieldHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fieldLabel: { color: Colors.text2, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  savedContactText: { color: Colors.success, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, flexShrink: 1 },
  recipientBox: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, borderRadius: Radius.lg, backgroundColor: 'rgba(26,26,38,0.74)', borderWidth: 1, borderColor: Colors.border },
  recipientBoxError: { borderColor: Colors.error },
  recipientInput: { flex: 1, minHeight: 54, color: Colors.text1, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.md },
  recipientActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recipientIconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,212,255,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.20)' },
  inlineErrorText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '700', lineHeight: 17 },
  contactsMiniWrap: { gap: 8, paddingTop: 2 },
  contactsMiniHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  contactsMiniTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 32 },
  contactsMiniText: { color: Colors.text2, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm },
  contactRailCompact: { gap: 8, paddingRight: 6 },
  contactPill: { maxWidth: 132, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: Colors.border },
  contactPillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  contactDot: { width: 8, height: 8, borderRadius: 8 },
  contactPillText: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, flexShrink: 1 },
  amountCard: { gap: 12, backgroundColor: 'rgba(18,18,28,0.9)', borderColor: 'rgba(255,255,255,0.08)' },
  amountCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  assetBadge: { maxWidth: 96, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  assetBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, letterSpacing: 0.2 },
  walletAmountRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  walletAmountInput: { flex: 1, minHeight: 62, color: Colors.text1, fontFamily: FontFamily.displayBold, fontSize: 34, letterSpacing: -0.8, paddingVertical: 0 },
  walletAmountSymbol: { maxWidth: 74, color: Colors.text2, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  balanceMaxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  availableText: { flex: 1, color: Colors.text3, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs },
  maxAction: { color: Colors.primary, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, letterSpacing: 0.5 },
  feeInline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: 'rgba(0,212,255,0.075)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.14)' },
  feeInlineOffline: { backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.24)' },
  feeInlineText: { flex: 1, color: Colors.text2, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs },
  confirmHero: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 4 },
  confirmAmount: { fontFamily: FontFamily.displayBold, fontSize: 52, color: Colors.text1, letterSpacing: -2 },
  confirmCurrency: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.lg, color: Colors.text2 },
  confirmCard: { gap: 4 },
  confirmArrow: { alignItems: 'center', paddingVertical: 2 },
  confirmDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  pendingCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  pendingTitle: { color: Colors.warning, fontWeight: '800' },
  pendingText: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 3 },
  pendingLink: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800', marginTop: 8 },
  errorCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: Colors.errorBg, borderColor: Colors.error },
  errorText: { fontSize: FontSize.sm, color: Colors.error, flex: 1 },
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: 12 },
  successIcon: { marginBottom: Spacing.sm },
  resultTitle: { fontFamily: FontFamily.displayBold, fontSize: FontSize.hero, color: Colors.text1 },
  resultAmount: { fontFamily: FontFamily.displayBold, fontSize: FontSize.xxl, color: Colors.success },
  resultSub: { fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.text2 },
  explorerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.elevated, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  explorerText: { fontSize: FontSize.xs, color: Colors.primary, fontFamily: FontFamily.mono },
  doneBtn: { width: '100%', marginTop: Spacing.lg },
});








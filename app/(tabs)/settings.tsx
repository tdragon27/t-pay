// app/(tabs)/settings.tsx - v1.1.0
// Upgrades: real seed phrase reveal and receive QR route.

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

import { useWalletStore } from '@/store/walletStore';
import { useArcWallet } from '@/hooks/useArcWallet';
import { loadSeedPhrase } from '@/lib/wallet';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { getArcCapabilityStatus } from '@/services/capabilityService';
import { checkArcRpcHealth, type ArcRpcHealth } from '@/services/arcHealthService';
import { buildDebugInfo } from '@/services/debugService';
import { useFiatCurrency } from '@/hooks/useFiatCurrency';
import { loadKeyRotationFindings, markKeyRotationWarningSeen, type KeyRotationFinding } from '@/services/keyRotationWarningService';
import { getCertificatePinningStatus } from '@/services/secureNetworkService';
import { ensureCriticalAuth } from '@/services/securityService';
import { copyWalletAddress } from '@/utils/copyWalletAddress';
import { UtilityBackButton } from '@/components/ui/UtilityBackButton';

// --- SettingsRow --------------------------------------------------------------

function SettingsRow({ icon, iconColor = '#9090B0', label, sublabel, value, onPress, showBorder = false, destructive = false }: {
  icon: keyof typeof Ionicons.glyphMap; iconColor?: string; label: string;
  sublabel?: string; value?: string; onPress: () => void;
  showBorder?: boolean; destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, showBorder && styles.rowBorder]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      activeOpacity={0.65}
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <View style={[styles.rowIcon, { backgroundColor: (destructive ? '#FF4D6A' : iconColor) + '18' }]}>
        <Ionicons name={icon} size={18} color={destructive ? '#FF4D6A' : iconColor} />
      </View>
      <View style={styles.rowMeta}>
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={15} color="#3A3A50" />
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// --- Seed Phrase Modal --------------------------------------------------------

function SeedPhraseModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading]   = useState(false);
  const [phrase, setPhrase]     = useState<string[] | null>(null);
  const [error, setError]       = useState('');
  const [revealed, setRevealed] = useState(false);

  async function handleReveal() {
    setLoading(true);
    setError('');
    try {
      const unlocked = await ensureCriticalAuth();
      if (!unlocked) {
        setError('PIN or biometric unlock is required before revealing the seed phrase.');
        return;
      }
      const seed = await loadSeedPhrase();
      if (!seed) {
        setError('No seed phrase found. This wallet may have been imported via private key.');
        return;
      }
      setPhrase(seed.split(' '));
      setRevealed(true);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load seed phrase.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setPhrase(null);
    setRevealed(false);
    setError('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modalSafe}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Seed Phrase</Text>
          <TouchableOpacity onPress={handleClose} style={styles.modalCloseBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}>
            <Ionicons name="close" size={24} color={Colors.text1} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalScroll}>
          {/* Warning */}
          <View style={styles.seedWarnBanner}>
            <Text style={styles.seedWarnIcon}>!</Text>
            <Text style={styles.seedWarnText}>
              Never share your seed phrase with anyone. Anyone who has it can steal your funds permanently.
            </Text>
          </View>

          {!revealed ? (
            /* Pre-reveal state */
            <View style={styles.seedRevealWrap}>
              <View style={styles.seedBlurCard}>
                <View style={styles.seedBlurGrid}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={styles.seedBlurChip}>
                      <Text style={styles.seedBlurNum}>{i + 1}</Text>
                      <Text style={styles.seedBlurWord}>******</Text>
                    </View>
                  ))}
                </View>
              </View>

              {error ? (
                <View style={styles.seedError}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
                  <Text style={styles.seedErrorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.revealBtn}
                onPress={handleReveal}
                disabled={loading}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <LinearGradient
                  colors={loading ? ['#2A2A3A', '#2A2A3A'] : ['#FFB547', '#E08C00']}
                  style={styles.revealBtnGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  {loading
                    ? <ActivityIndicator color="#9090B0" size="small" />
                    : <>
                        <Ionicons name="eye-outline" size={18} color="#0A0A0F" />
                        <Text style={styles.revealBtnText}>Reveal Seed Phrase</Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.revealHint}>Make sure no one is watching your screen.</Text>
            </View>
          ) : (
            /* Revealed state */
            <View style={styles.seedRevealedWrap}>
              <View style={styles.seedGrid}>
                {phrase!.map((word, i) => (
                  <View key={i} style={styles.seedChip}>
                    <Text style={styles.seedChipNum}>{i + 1}</Text>
                    <Text style={styles.seedChipWord}>{word}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.copyPhraseBtn}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#9090B0" />
                <Text style={styles.copyPhraseBtnText}>Clipboard copy is disabled. Write the phrase down offline.</Text>
              </View>

              {/* Hide again */}
              <TouchableOpacity
                style={styles.hideAgainBtn}
                onPress={() => { setRevealed(false); setPhrase(null); }}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Ionicons name="eye-off-outline" size={14} color="#5050A0" />
                <Text style={styles.hideAgainText}>Hide phrase</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// --- Main Screen --------------------------------------------------------------

export default function SettingsScreen() {
  const router = useRouter();
  const { address, hideBalance, setHideBalance } = useWalletStore();
  const { disconnectWallet } = useArcWallet();

  const [showFullAddress, setShowFullAddress] = useState(false);
  const [seedModalVisible, setSeedModalVisible] = useState(false);
  const [rpcHealth, setRpcHealth] = useState<ArcRpcHealth | null>(null);
  const [rpcChecking, setRpcChecking] = useState(false);
  const [keyFindings, setKeyFindings] = useState<KeyRotationFinding[]>([]);
  const arcCapabilities = getArcCapabilityStatus();
  const { currency, changeCurrency, rateAge, rateSource } = useFiatCurrency();
  const pinningStatus = getCertificatePinningStatus();

  useEffect(() => {
    loadKeyRotationFindings().then(setKeyFindings);
  }, []);

  const displayAddress = address
    ? showFullAddress ? address : `${address.slice(0, 10)}...${address.slice(-8)}`
    : 'Not connected';

  async function handleCopyAddress() {
    await copyWalletAddress(address, { subtitle: address ?? undefined });
  }

  async function handleCheckRpcHealth() {
    setRpcChecking(true);
    try {
      const health = await checkArcRpcHealth();
      setRpcHealth(health);
      Toast.show({
        type: health.status === 'offline' ? 'error' : 'success',
        text1: health.status === 'offline' ? 'Arc RPC issue' : 'Arc RPC is reachable',
        text2: health.message,
      });
    } finally {
      setRpcChecking(false);
    }
  }

  async function handleCopyDebugInfo() {
    await Clipboard.setStringAsync(buildDebugInfo(address));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Debug info copied', text2: 'Safe to share. No seed phrase/private key included.' });
  }

  async function cycleFiatCurrency() {
    const next = currency === 'USD' ? 'VND' : currency === 'VND' ? 'EUR' : 'USD';
    await changeCurrency(next);
    Toast.show({ type: 'success', text1: 'Currency updated', text2: 'Now showing ' + next });
  }

  function handleDisconnect() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Remove Wallet',
      'This will permanently delete your wallet from this device. Make sure you have your seed phrase backed up.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Wallet', style: 'destructive',
          onPress: async () => {
            await disconnectWallet();
            router.replace('/(onboarding)/welcome');
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <UtilityBackButton />
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v1.1.0</Text>
          </View>
        </View>

        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarChar}>T</Text>
          </View>
          <View style={styles.identityMeta}>
            <Text style={styles.identityLabel}>My Wallet</Text>
            <TouchableOpacity onPress={() => setShowFullAddress(!showFullAddress)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
              <Text style={styles.identityAddress}>{displayAddress}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopyAddress} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="copy-outline" size={18} color="#9090B0" />
          </TouchableOpacity>
        </View>

        {/* -- Wallet ---------------------------------------------------------- */}
        <SectionHeader title="Wallet" />
        <View style={styles.card}>
          <SettingsRow
            icon="eye-outline" iconColor="#00D4FF" label="Hide Balance"
            value={hideBalance ? 'On' : 'Off'}
            onPress={() => setHideBalance(!hideBalance)} showBorder
          />
          <SettingsRow
            icon="copy-outline" iconColor="#00D4FF" label="Copy Address"
            sublabel={address ? `${address.slice(0, 14)}...` : undefined}
            onPress={handleCopyAddress} showBorder
          />
          <SettingsRow
            icon="cash-outline" iconColor="#00D4FF" label="Display Currency"
            sublabel={`Rates from ${rateSource}, updated ${rateAge}`}
            value={currency}
            onPress={cycleFiatCurrency} showBorder
          />
          {/* v1.1.0: navigates to /receive modal which has QR */}
          <SettingsRow
            icon="qr-code-outline" iconColor="#00E88F" label="Show QR Code"
            sublabel="Scan to receive USDC"
            onPress={() => router.push('/receive')}
            showBorder
          />
          <SettingsRow
            icon="people-outline" iconColor="#00E88F" label="Contacts"
            sublabel="Saved payees and JSON export"
            onPress={() => router.push('/contacts' as any)}
          />
        </View>

        {/* -- Security -------------------------------------------------------- */}
        <SectionHeader title="Security" />
        {keyFindings.length > 0 ? (
          <View style={styles.keyWarningCard}>
            <Ionicons name="warning-outline" size={18} color="#FFB547" />
            <View style={{ flex: 1 }}>
              <Text style={styles.keyWarningTitle}>Environment review needed</Text>
              <Text style={styles.keyWarningText}>{keyFindings.length} public config value looks like a placeholder. Rotate or replace before user testing.</Text>
            </View>
            <TouchableOpacity onPress={markKeyRotationWarningSeen}><Text style={styles.keyWarningAction}>Seen</Text></TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.card}>
          {/* v1.1.0: opens real seed phrase modal */}
          <SettingsRow
            icon="shield-checkmark-outline" iconColor="#FFB547" label="View Seed Phrase"
            sublabel="Tap to reveal your 12 words"
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setSeedModalVisible(true);
            }}
            showBorder
          />
          <SettingsRow
            icon="key-outline" iconColor="#FFB547" label="Security Backup Center"
            sublabel="Backup checklist and private-key export"
            onPress={() => router.push('/security-backup' as any)}
          />
        </View>

        {/* -- Faucet ---------------------------------------------------------- */}
        <SectionHeader title="Testnet" />
        <View style={styles.card}>
          <SettingsRow
            icon="water-outline" iconColor="#8B79FF" label="Get Testnet USDC"
            sublabel="Open Circle faucet guide"
            onPress={() => router.push('/faucet')}
            showBorder
          />
          <SettingsRow
            icon="swap-horizontal-outline" iconColor="#FFB547" label="Bridge USDC"
            sublabel="Cross-chain via CCTP"
            onPress={() => router.push('/bridge')}
          />
        </View>

        {/* -- Network --------------------------------------------------------- */}
        <SectionHeader title="Arc Readiness" />
        <View style={styles.card}>
          {arcCapabilities.map((capability, index) => (
            <SettingsRow
              key={capability.id}
              icon={capability.status === 'ready' || capability.status === 'configured' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              iconColor={capability.status === 'ready' || capability.status === 'configured' ? '#00E88F' : '#FFB547'}
              label={capability.label}
              sublabel={capability.description}
              value={capability.status}
              onPress={() => {}}
              showBorder={index < arcCapabilities.length - 1}
            />
          ))}
        </View>
        <SectionHeader title="Network" />
        <View style={styles.card}>
          <SettingsRow
            icon="globe-outline" iconColor="#9090B0" label="Network"
            value="Arc Testnet" onPress={() => {}} showBorder
          />
          <SettingsRow
            icon={rpcChecking ? 'sync-outline' : 'pulse-outline'} iconColor={rpcHealth?.status === 'offline' ? '#FF4D6A' : '#00E88F'} label="RPC Health Check"
            sublabel={rpcHealth?.message ?? 'Tap to verify Arc Testnet RPC, chain id, and latest block'}
            value={rpcChecking ? 'checking' : rpcHealth?.status ?? 'unknown'}
            onPress={handleCheckRpcHealth}
            showBorder
          />
          <SettingsRow
            icon="server-outline" iconColor="#9090B0" label="RPC Endpoint"
            sublabel="Default Arc node" onPress={() => {}} showBorder
          />
          <SettingsRow
            icon="lock-closed-outline" iconColor="#FFB547" label="Certificate Pinning"
            sublabel={pinningStatus.mode === 'blocked' ? 'Required but native module is not active' : pinningStatus.mode === 'enforced' ? 'Native pinning enforced' : 'HTTPS-only in Expo runtime'}
            value={pinningStatus.mode}
            onPress={() => {}} showBorder
          />
          <SettingsRow
            icon="bug-outline" iconColor="#8B79FF" label="Developer Debug"
            sublabel="Inspect testnet state, cache, RPC and payment records"
            onPress={() => router.push('/developer-debug' as any)} showBorder
          />
          <SettingsRow
            icon="copy-outline" iconColor="#8B79FF" label="Copy Debug Info"
            sublabel="Safe support snapshot, no secret keys"
            onPress={handleCopyDebugInfo}
          />
        </View>

        {/* -- About ----------------------------------------------------------- */}
        <SectionHeader title="Operations" />
        <View style={styles.card}>
          <SettingsRow
            icon="notifications-outline" iconColor="#00D4FF" label="Notifications Center"
            sublabel="Payment, bridge, invoice and security events"
            onPress={() => router.push('/notifications' as any)} showBorder
          />
          <SettingsRow
            icon="sparkles-outline" iconColor="#FFB547" label="Gas Sponsorship Readiness"
            sublabel="Smart wallet and paymaster configuration"
            onPress={() => router.push('/gas-sponsorship' as any)}
          />
        </View>
        <SectionHeader title="About" />
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline" iconColor="#9090B0"
            label="Version" value="1.1.0" onPress={() => {}} showBorder
          />
          <SettingsRow
            icon="document-text-outline" iconColor="#9090B0"
            label="Terms of Service" onPress={() => {}} showBorder
          />
          <SettingsRow
            icon="lock-closed-outline" iconColor="#9090B0"
            label="Privacy Policy" onPress={() => {}}
          />
        </View>

        {/* -- Danger zone ----------------------------------------------------- */}
        <SectionHeader title="Danger Zone" />
        <View style={styles.card}>
          <SettingsRow
            icon="trash-outline" label="Remove Wallet from Device"
            onPress={handleDisconnect} destructive
          />
        </View>

        <Text style={styles.disclaimer}>
          T Pay v1.1.0 - self-custodial wallet.{'\n'}
          We never store your private keys or seed phrase on our servers.
        </Text>

        <View style={{ height: Platform.OS === 'ios' ? 100 : 80 }} />
      </ScrollView>

      {/* Seed phrase modal */}
      <SeedPhraseModal
        visible={seedModalVisible}
        onClose={() => setSeedModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, marginBottom: 12 },
  headerTitle: { flex: 1, fontFamily: FontFamily.displaySemiBold, fontSize: 22, color: '#F0F0FF' },
  versionBadge: { backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  versionText: { fontFamily: FontFamily.mono, fontSize: 11, color: '#00D4FF' },

  identityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderWidth: 1, borderColor: '#2A2A3A', borderRadius: 18, padding: 16, marginBottom: 24, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarChar:      { fontSize: 22, color: '#00D4FF' },
  identityMeta:    { flex: 1, gap: 3 },
  identityLabel:   { fontWeight: '700', fontSize: 14, color: '#F0F0FF' },
  identityAddress: { fontFamily: FontFamily.mono, fontSize: 11, color: '#9090B0' },
  copyBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A2A3A' },

  sectionTitle: { fontWeight: '700', fontSize: 12, color: '#5050A0', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },

  card: { backgroundColor: '#12121A', borderRadius: 18, borderWidth: 1, borderColor: '#2A2A3A', overflow: 'hidden', marginBottom: 24 },
  keyWarningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,181,71,0.1)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.28)', marginBottom: 14 },
  keyWarningTitle: { fontWeight: '700', color: '#FFB547', fontSize: 13 },
  keyWarningText: { color: '#FFD080', fontSize: 12, lineHeight: 17, marginTop: 2 },
  keyWarningAction: { fontWeight: '700', color: '#00D4FF', fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E2A' },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowMeta: { flex: 1, gap: 2 },
  rowLabel: { fontWeight: '700', fontSize: 14, color: '#F0F0FF' },
  rowLabelDestructive: { color: '#FF4D6A' },
  rowSublabel: { fontSize: 12, color: '#9090B0' },
  rowValue: { fontWeight: '500', fontSize: 13, color: '#9090B0', marginRight: 4 },

  disclaimer: { fontSize: 12, color: '#3A3A50', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8, marginBottom: 8 },

  // -- Seed Phrase Modal ------------------------------------------------------
  modalSafe:      { flex: 1, backgroundColor: '#0A0A0F' },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:     { fontWeight: '700', fontSize: 18, color: Colors.text1 },
  modalCloseBtn:  { padding: 8 },
  modalScroll:    { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },

  seedWarnBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,181,71,0.1)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.25)', borderRadius: 12, padding: 14 },
  seedWarnIcon:   { fontSize: 16 },
  seedWarnText:   { flex: 1, fontSize: 13, color: '#FFD080', lineHeight: 20 },

  seedRevealWrap:  { alignItems: 'center', gap: 20 },
  seedBlurCard:    { width: '100%', backgroundColor: '#12121A', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A3A', padding: 16, overflow: 'hidden' },
  seedBlurGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seedBlurChip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A26', borderWidth: 1, borderColor: '#2A2A3A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, width: '30%', gap: 6 },
  seedBlurNum:     { fontFamily: FontFamily.mono, fontSize: 10, color: '#3A3A50', minWidth: 14 },
  seedBlurWord:    { fontSize: 13, color: '#3A3A50' },

  seedError:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error, borderRadius: 10, padding: 12, width: '100%' },
  seedErrorText: { flex: 1, fontSize: 13, color: Colors.error, lineHeight: 19 },

  revealBtn:       { width: '100%', borderRadius: 16, overflow: 'hidden' },
  revealBtnGrad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  revealBtnText:   { fontWeight: '700', fontSize: 16, color: '#0A0A0F' },
  revealHint:      { fontSize: 12, color: '#5050A0', textAlign: 'center' },

  seedRevealedWrap: { gap: 16 },
  seedGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seedChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A26', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, width: '30%', gap: 6 },
  seedChipNum:  { fontFamily: FontFamily.mono, fontSize: 10, color: '#5050A0', minWidth: 14 },
  seedChipWord: { fontWeight: '700', fontSize: 13, color: '#F0F0FF' },

  copyPhraseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderWidth: 1, borderColor: '#2A2A3A', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  copyPhraseBtnText: { fontWeight: '500', fontSize: 14, color: '#9090B0' },

  hideAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  hideAgainText:{ fontSize: 13, color: '#5050A0' },
});
















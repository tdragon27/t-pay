import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { buildSmartQrLink, type SmartQrPayload } from '@/services/paymentRequestService';
import { recordPassportEvent } from '@/services/passportService';
import { useWalletStore } from '@/store/walletStore';
import { sanitizeAmount, shortenAddress } from '@/utils/format';
import { copyWalletAddress } from '@/utils/copyWalletAddress';

type SmartQrMode = 'request' | 'split' | 'profile';

const MODE_COPY: Record<SmartQrMode, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  request: {
    title: 'Request money',
    subtitle: 'Ask someone to send USDC to your wallet.',
    icon: 'arrow-down-circle-outline',
  },
  split: {
    title: 'Split bill',
    subtitle: 'Create a QR for one person\'s share.',
    icon: 'people-outline',
  },
  profile: {
    title: 'Wallet profile',
    subtitle: 'Share your wallet as a reusable contact QR.',
    icon: 'person-circle-outline',
  },
};

function ModeButton({ mode, active, onPress }: { mode: SmartQrMode; active: boolean; onPress: () => void }) {
  const copy = MODE_COPY[mode];
  return (
    <TouchableOpacity style={[styles.modeButton, active && styles.modeButtonActive]} onPress={onPress} activeOpacity={0.78}>
      <Ionicons name={copy.icon} size={18} color={active ? Colors.bg : Colors.text2} />
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{copy.title}</Text>
    </TouchableOpacity>
  );
}

export default function SmartQrScreen() {
  const router = useRouter();
  const { address } = useWalletStore();
  const [mode, setMode] = useState<SmartQrMode>('request');
  const [amount, setAmount] = useState('5');
  const [participants, setParticipants] = useState('2');
  const [label, setLabel] = useState('T Pay request');

  const numericAmount = Number(amount || '0');
  const participantCount = Math.max(1, Number(participants || '1') || 1);
  const shareAmount = mode === 'split' && numericAmount > 0 ? (numericAmount / participantCount).toFixed(2) : amount;

  const qrValue = useMemo(() => {
    if (!address) return '';
    const base = {
      address,
      token: 'USDC',
      label,
    };
    const payload: SmartQrPayload = mode === 'profile'
      ? { type: 'profile', address, label: label || 'T Pay wallet' }
      : mode === 'split'
        ? { type: 'split', ...base, amount: shareAmount, splitId: `split_${Date.now()}` }
        : { type: 'request', ...base, amount };
    return buildSmartQrLink(payload);
  }, [address, amount, label, mode, shareAmount]);

  async function copyQr() {
    if (!qrValue || !address) return;
    await Clipboard.setStringAsync(qrValue);
    await recordPassportEvent(address, {
      id: `smart_qr_copy_${mode}_${Date.now()}`,
      type: 'smart_qr_create',
      points: 20,
      label: `Created ${mode} QR`,
      metadata: { mode, amount: mode === 'profile' ? undefined : mode === 'split' ? shareAmount : amount },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Smart QR copied', text2: MODE_COPY[mode].title });
  }

  async function copyWallet() {
    await copyWalletAddress(address, { subtitle: 'Paste it into any wallet or chat.' });
  }

  async function shareQr() {
    if (!qrValue || !address) return;
    await recordPassportEvent(address, {
      id: `smart_qr_share_${mode}_${Date.now()}`,
      type: 'smart_qr_create',
      points: 25,
      label: `Shared ${mode} QR`,
      metadata: { mode, amount: mode === 'profile' ? undefined : mode === 'split' ? shareAmount : amount },
    });
    await Share.share({ title: 'T Pay Smart QR', message: `${MODE_COPY[mode].title}\n${qrValue}` });
  }

  function validateMode(nextMode = mode) {
    if (nextMode === 'profile') return true;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Amount required', 'Enter a positive USDC amount for this QR.');
      return false;
    }
    if (nextMode === 'split' && (!Number.isFinite(participantCount) || participantCount <= 0)) {
      Alert.alert('Participants required', 'Enter how many people are splitting the bill.');
      return false;
    }
    return true;
  }

  const copy = MODE_COPY[mode];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}><Ionicons name="arrow-back" size={22} color={Colors.text1} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Smart QR</Text>
        <View style={styles.iconSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <View style={styles.heroIcon}><Ionicons name="qr-code-outline" size={28} color={Colors.primary} /></View>
          <Text style={styles.heroTitle}>One QR, many payment actions.</Text>
          <Text style={styles.heroSub}>Create request, split-bill, or wallet profile QR codes. Scanning opens the right T Pay flow automatically.</Text>
        </Card>

        <View style={styles.modeRow}>
          {(['request', 'split', 'profile'] as SmartQrMode[]).map((item) => (
            <ModeButton key={item} mode={item} active={mode === item} onPress={() => setMode(item)} />
          ))}
        </View>

        <Card style={styles.formCard}>
          <View style={styles.sectionTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{copy.title}</Text>
              <Text style={styles.sectionSub}>{copy.subtitle}</Text>
            </View>
            <Ionicons name={copy.icon} size={22} color={Colors.primary} />
          </View>

          {mode !== 'profile' ? (
            <Input label={mode === 'split' ? 'Total Bill (USDC)' : 'Amount (USDC)'} value={amount} onChangeText={(value) => setAmount(sanitizeAmount(value))} keyboardType="decimal-pad" placeholder="5.00" />
          ) : null}
          {mode === 'split' ? (
            <Input label="People Splitting" value={participants} onChangeText={(value) => setParticipants(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="2" />
          ) : null}
          <Input label="Label" value={label} onChangeText={setLabel} placeholder="Coffee, dinner, invoice..." />

          <View style={styles.previewBox}>
            <View style={styles.previewWalletRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewLabel}>Recipient wallet</Text>
                <Text style={styles.previewValue}>{address ? shortenAddress(address, 8) : 'No wallet'}</Text>
              </View>
              <TouchableOpacity style={styles.copyWalletBtn} disabled={!address} onPress={copyWallet} activeOpacity={0.75}>
                <Ionicons name="copy-outline" size={14} color={Colors.primary} />
                <Text style={styles.copyWalletText}>Copy wallet</Text>
              </TouchableOpacity>
            </View>
            {mode !== 'profile' ? (
              <>
                <Text style={styles.previewLabel}>{mode === 'split' ? 'Each person pays' : 'Requested amount'}</Text>
                <Text style={styles.previewAmount}>{mode === 'split' ? shareAmount : amount || '0'} USDC</Text>
              </>
            ) : null}
          </View>
        </Card>

        <Card style={styles.qrCard}>
          {address ? (
            <View style={styles.qrShell}>
              <QRCode value={qrValue} size={218} color={Colors.text1} backgroundColor={Colors.surface} />
            </View>
          ) : (
            <View style={styles.emptyQr}><Ionicons name="wallet-outline" size={30} color={Colors.text3} /><Text style={styles.emptyText}>Create or import a wallet first.</Text></View>
          )}
          <Text style={styles.qrMeta} numberOfLines={2}>{qrValue || 'Smart QR will appear here.'}</Text>
          <View style={styles.actionRow}>
            <Button label="Copy" variant="secondary" disabled={!address} onPress={() => validateMode() && copyQr()} style={{ flex: 1 }} />
            <Button label="Share" disabled={!address} onPress={() => validateMode() && shareQr()} style={{ flex: 1 }} />
          </View>
        </Card>

        <View style={{ height: 80 }} />
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
  content: { padding: Spacing.md, gap: Spacing.md },
  heroCard: { gap: 10, borderRadius: 28, backgroundColor: '#101820' },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.24)' },
  heroTitle: { color: Colors.text1, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.7 },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 21 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, minHeight: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  modeButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeText: { color: Colors.text2, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  modeTextActive: { color: Colors.bg },
  formCard: { gap: Spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  sectionSub: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 18, marginTop: 3 },
  previewBox: { padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: Colors.border, gap: 10 },
  previewWalletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  copyWalletBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.24)' },
  copyWalletText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  previewLabel: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewValue: { color: Colors.text1, fontSize: FontSize.sm, fontFamily: 'SpaceMono-Regular' },
  previewAmount: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800' },
  qrCard: { gap: Spacing.md, alignItems: 'stretch' },
  qrShell: { alignSelf: 'center', padding: 18, borderRadius: 28, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  emptyQr: { alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 220 },
  emptyText: { color: Colors.text2, fontSize: FontSize.sm },
  qrMeta: { color: Colors.text3, fontSize: FontSize.xs, lineHeight: 17, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10 },
});






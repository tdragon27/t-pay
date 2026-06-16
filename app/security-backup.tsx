import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { loadPrivateKey, loadSeedPhrase } from '@/lib/wallet';
import { notifySecurityEvent } from '@/services/notificationService';
import { ensureCriticalAuth } from '@/services/securityService';

const BACKUP_CONFIRMED_KEY = 'tpay_backup_confirmed_v1';
const EXPORT_CONFIRM_TEXT = 'I UNDERSTAND';

export default function SecurityBackupScreen() {
  const router = useRouter();
  const [hasSeed, setHasSeed] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [exportPhrase, setExportPhrase] = useState('');
  const [loading, setLoading] = useState(true);

  async function hydrate() {
    setLoading(true);
    try {
      const [seed, confirmed] = await Promise.all([
        loadSeedPhrase(),
        AsyncStorage.getItem(BACKUP_CONFIRMED_KEY),
      ]);
      setHasSeed(Boolean(seed));
      setBackupConfirmed(confirmed === 'true');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    hydrate();
  }, []);

  async function handleBackupConfirmed() {
    await AsyncStorage.setItem(BACKUP_CONFIRMED_KEY, 'true');
    setBackupConfirmed(true);
    await notifySecurityEvent('Backup confirmed', 'Seed phrase backup checklist was marked complete.');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCopyPrivateKey() {
    if (exportPhrase.trim() !== EXPORT_CONFIRM_TEXT) {
      Alert.alert('Confirmation required', `Type ${EXPORT_CONFIRM_TEXT} before exporting your private key.`);
      return;
    }

    Alert.alert(
      'Export private key?',
      'Anyone with this key can fully control this wallet. Only export if you know where you will store it safely.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          style: 'destructive',
          onPress: async () => {
            const unlocked = await ensureCriticalAuth();
            if (!unlocked) {
              Alert.alert('Unlock required', 'PIN or biometric unlock is required before exporting a private key.');
              return;
            }
            const key = await loadPrivateKey();
            if (!key) {
              Alert.alert('No key found', 'Create or import a wallet first.');
              return;
            }
            await Clipboard.setStringAsync(key);
            await notifySecurityEvent('Private key exported', 'Private key was copied to clipboard on this device.');
            Toast.show({ type: 'info', text1: 'Private key copied', text2: 'Clear your clipboard after storing it safely.' });
            setExportPhrase('');
          },
        },
      ],
    );
  }

  const checklist = [
    { label: 'Seed phrase exists on this device', ok: hasSeed },
    { label: 'Backup checklist confirmed', ok: backupConfirmed },
    { label: 'Never share seed/private key with support or strangers', ok: true },
    { label: 'Testnet only: do not store mainnet funds here yet', ok: true },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security Backup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Self-custody guardrails</Text>
          <Text style={styles.heroTitle}>Protect the wallet before real user testnet payments.</Text>
          <Text style={styles.heroSub}>T Pay never sends your seed phrase or private key to a server. Exports are local-only and require explicit confirmation.</Text>
        </Card>

        <Card style={styles.cardGap}>
          <Text style={styles.sectionTitle}>Backup checklist</Text>
          {checklist.map((item, index) => (
            <View key={item.label} style={[styles.checkRow, index < checklist.length - 1 && styles.rowBorder]}>
              <Ionicons name={item.ok ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={item.ok ? Colors.success : Colors.text3} />
              <Text style={styles.checkLabel}>{item.label}</Text>
            </View>
          ))}
          <Button label={backupConfirmed ? 'Backup Confirmed' : 'I have backed up my seed phrase'} disabled={backupConfirmed || loading} onPress={handleBackupConfirmed} />
        </Card>

        <Card style={styles.warningCard}>
          <Ionicons name="warning-outline" size={20} color={Colors.warning} />
          <Text style={styles.warningText}>Private-key export is dangerous. Prefer seed phrase backup unless an integration specifically requires the raw key.</Text>
        </Card>

        <Card style={styles.cardGap}>
          <Text style={styles.sectionTitle}>Export private key</Text>
          <Text style={styles.bodyText}>Type {EXPORT_CONFIRM_TEXT} to unlock the export button. The key is copied to clipboard only after a final confirmation dialog.</Text>
          <Input label="Confirmation" value={exportPhrase} onChangeText={setExportPhrase} placeholder={EXPORT_CONFIRM_TEXT} autoCapitalize="characters" />
          <Button label="Copy Private Key" variant="secondary" disabled={exportPhrase.trim() !== EXPORT_CONFIRM_TEXT} onPress={handleCopyPrivateKey} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, paddingBottom: Spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  heroCard: { gap: 10, backgroundColor: '#19140D', borderColor: 'rgba(255,181,71,0.28)' },
  heroEyebrow: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { color: Colors.text1, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  cardGap: { gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E2A' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  checkLabel: { color: Colors.text1, fontSize: FontSize.sm, flex: 1 },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  warningText: { color: Colors.warning, fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
  bodyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
});







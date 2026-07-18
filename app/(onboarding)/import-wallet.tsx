// app/(onboarding)/import-wallet.tsx
// -----------------------------------------------------------------------------
// Import an existing wallet via 12-word seed phrase or raw private key.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import {
  deriveFromMnemonic,
  importFromPrivateKey,
  loadPrivateKey,
  saveWalletSecurely,
  validateMnemonic,
} from '@/lib/wallet';
import { saveAddress, markOnboardingComplete } from '@/utils/storage';
import { useWalletStore } from '@/store/walletStore';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '@/constants/theme';

type Mode = 'seed' | 'privatekey';

export default function ImportWalletScreen() {
  const router = useRouter();
  const { setAddress } = useWalletStore();

  const [mode, setMode] = useState<Mode>('seed');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setError('');
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Please enter your seed phrase or private key.');
      return;
    }

    setLoading(true);
    try {
      let wallet;
      if (mode === 'seed') {
        if (!validateMnemonic(trimmed)) {
          setError('Invalid seed phrase. Check each word and try again.');
          setLoading(false);
          return;
        }
        wallet = await deriveFromMnemonic(trimmed);
      } else {
        wallet = await importFromPrivateKey(trimmed);
      }

      await saveWalletSecurely(wallet);

      // Audit step: ensure the active storage adapter returns the same address.
      const storedPk = await loadPrivateKey();
      if (!storedPk) {
        throw new Error('Saved private key could not be verified.');
      }
      const restored = await importFromPrivateKey(storedPk);
      if (restored.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error('Wallet verification failed after save. Please retry.');
      }

      await saveAddress(wallet.address);
      await markOnboardingComplete();
      setAddress(wallet.address);

      // Clear sensitive input immediately
      setInput('');

      router.replace('/(tabs)/home');
    } catch (e: any) {
      setError(e.message ?? 'Import failed. Please check your input.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text1} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Wallet</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            {(['seed', 'privatekey'] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => { setMode(m); setInput(''); setError(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                  {m === 'seed' ? 'Seed Phrase' : 'Private Key'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Description */}
          <Card style={styles.infoCard}>
            <Ionicons
              name={mode === 'seed' ? 'list-outline' : 'key-outline'}
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.infoText}>
              {mode === 'seed'
                ? 'Enter your 12 or 24-word BIP39 seed phrase, separated by spaces.'
                : 'Enter your 64-character hex private key (with or without 0x prefix).'}
            </Text>
          </Card>

          {Platform.OS === 'web' && (
            <View style={styles.browserNotice}>
              <Ionicons name="desktop-outline" size={18} color={Colors.primary} />
              <Text style={styles.browserNoticeText}>
                Browser preview keeps this wallet only until the tab reloads or closes. Use the mobile app for persistent secure storage.
              </Text>
            </View>
          )}

          {/* Input */}
          <Input
            label={mode === 'seed' ? 'Seed Phrase' : 'Private Key'}
            value={input}
            onChangeText={(t) => { setInput(t); setError(''); }}
            placeholder={
              mode === 'seed'
                ? 'word1 word2 word3 ...'
                : '0x or 64 hex characters'
            }
            multiline={mode === 'seed'}
            numberOfLines={mode === 'seed' ? 4 : 1}
            secureTextEntry={!showInput}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            error={error}
            style={mode === 'seed' && styles.seedInput}
            rightIcon={
              <TouchableOpacity onPress={() => setShowInput((s) => !s)}>
                <Ionicons
                  name={showInput ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.text2}
                />
              </TouchableOpacity>
            }
          />

          {/* Security warning */}
          <View style={styles.warnRow}>
            <Ionicons name="shield-outline" size={16} color={Colors.text3} />
            <Text style={styles.warnText}>
              {Platform.OS === 'web'
                ? 'Your key stays in this browser tab and is not written to local storage.'
                : "Your key never leaves this device. It's stored in encrypted device storage."}
            </Text>
          </View>

          <Button
            label="Import Wallet"
            loading={loading}
            disabled={!input.trim()}
            onPress={handleImport}
          />

          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => safeBack(router)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn:      { padding: 8 },
  headerTitle:  { fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.lg, color: Colors.text1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: Colors.elevated,
  },
  modeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.text2,
    fontWeight: '500',
  },
  modeBtnTextActive: {
    color: Colors.text1,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.text2,
    flex: 1,
    lineHeight: 20,
  },
  browserNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.24)',
    backgroundColor: 'rgba(0,212,255,0.07)',
  },
  browserNoticeText: {
    flex: 1,
    color: Colors.text2,
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  seedInput:  { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  warnText: { fontSize: FontSize.xs, color: Colors.text3, flex: 1, lineHeight: 18 },
});




// app/(onboarding)/create-wallet.tsx
// -----------------------------------------------------------------------------
// Creates a new HD wallet: generates 12-word mnemonic, shows it for backup,
// then persists securely and navigates to the app.
//
// Upgrades over v1:
//   - 'saving'  step  ? spinner while saving to SecureStore
//   - 'success' step  ? animated checkmark + auto-redirect after 2.5 s
//   - Errors shown via Toast (not Alert), with a loading guard on the CTA
//   - Confirm button shows ActivityIndicator while saving
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import {
  createNewWallet,
  importFromPrivateKey,
  loadPrivateKey,
  saveWalletSecurely,
  type WalletInfo,
} from '@/lib/wallet';
import { saveAddress, markOnboardingComplete } from '@/utils/storage';
import { useWalletStore } from '@/store/walletStore';

// --- Types --------------------------------------------------------------------

type Step = 'generating' | 'show_phrase' | 'saving' | 'success';

// --- Success Screen -----------------------------------------------------------

interface SuccessScreenProps {
  address: string;
  onContinue: () => void;
}

function SuccessScreen({ address, onContinue }: SuccessScreenProps) {
  // Checkmark circle animation
  const ringScale    = useSharedValue(0);
  const ringOpacity  = useSharedValue(0);
  const iconScale    = useSharedValue(0);
  const textOpacity  = useSharedValue(0);
  const btnOpacity   = useSharedValue(0);

  useEffect(() => {    // 1. Ring scales in
    ringOpacity.value = withTiming(1, { duration: 200 });
    ringScale.value   = withSpring(1, { damping: 14, stiffness: 120 });
    // 2. Icon bounces in
    iconScale.value   = withDelay(180, withSpring(1, { damping: 12, stiffness: 140 }));
    // 3. Text fades in
    textOpacity.value = withDelay(380, withTiming(1, { duration: 400 }));
    // 4. Button fades in
    btnOpacity.value  = withDelay(600, withTiming(1, { duration: 350 }));
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    opacity:   ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));
  const btnStyle  = useAnimatedStyle(() => ({ opacity: btnOpacity.value }));

  const shortAddr = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : '';

  return (
    <View style={styles.successContainer}>
      {/* Animated checkmark circle */}
      <Animated.View style={[styles.successRingWrap, ringStyle]}>
        <LinearGradient
          colors={['#00E88F', '#00B872']}
          style={styles.successRing}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Animated.View style={iconStyle}>
            <Ionicons name="checkmark" size={54} color="#FFFFFF" />
          </Animated.View>
        </LinearGradient>
        {/* Outer glow ring */}
        <View style={styles.successGlowRing} />
      </Animated.View>

      {/* Text content */}
      <Animated.View style={[styles.successTextWrap, textStyle]}>
        <Text style={styles.successTitle}>Wallet Created!</Text>
        <Text style={styles.successSub}>
          Your self-custodial T Pay wallet is ready.
        </Text>

        {/* Address pill */}
        <View style={styles.successAddressPill}>
          <Text style={styles.successAddressLabel}>Wallet address</Text>
          <Text style={styles.successAddressValue}>{shortAddr}</Text>
        </View>

        <Text style={styles.successHint}>
          Redirecting to your dashboard in a moment...
        </Text>
      </Animated.View>

      {/* Manual CTA (in case auto-redirect is slow) */}
      <Animated.View style={[styles.successBtnWrap, btnStyle]}>
        <TouchableOpacity
          style={styles.successBtn}
          onPress={onContinue}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <LinearGradient
            colors={['#00D4FF', '#0066FF']}
            style={styles.successBtnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.successBtnText}>Go to Dashboard →</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// --- Main Screen --------------------------------------------------------------

export default function CreateWalletScreen() {
  const router    = useRouter();
  const { setAddress } = useWalletStore();

  const [step, setStep]                     = useState<Step>('generating');
  const [mnemonic, setMnemonic]             = useState<string[]>([]);
  const [walletAddress, setWalletAddress]   = useState('');
  const [generatedWallet, setGeneratedWallet] = useState<WalletInfo | null>(null);
  const [confirmed, setConfirmed]           = useState(false);
  const [phraseHidden, setPhraseHidden]     = useState(true);
  const [isSaving, setIsSaving]             = useState(false);

  const autoRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Generate on mount ---------------------------------------------------

  useEffect(() => {
    generate();
    return () => {
      if (autoRedirectRef.current) clearTimeout(autoRedirectRef.current);
    };
  }, []);

  async function generate() {
    setStep('generating');
    try {
      await new Promise((r) => setTimeout(r, 700));   // brief UX delay
      const wallet = await createNewWallet();
      setGeneratedWallet(wallet);
      setMnemonic(wallet.mnemonic!.split(' '));
      setWalletAddress(wallet.address);
      setStep('show_phrase');
    } catch (e: any) {
      console.error('[create-wallet] generate error', e);
      Toast.show({
        type:  'error',
        text1: 'Generation failed',
        text2: e?.message ?? 'Please try again.',
      });
    }
  }

  // --- Save & verify -------------------------------------------------------

  async function handleContinue() {
    if (!confirmed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Toast.show({
        type:  'error',
        text1: 'Backup required',
        text2: 'Please confirm you have written down your seed phrase.',
      });
      return;
    }
    if (!generatedWallet) {
      Toast.show({
        type:  'error',
        text1: 'Wallet state lost',
        text2: 'Please go back and try again.',
      });
      return;
    }

    setIsSaving(true);
    setStep('saving');

    try {
      // 1. Persist to SecureStore
      await saveWalletSecurely(generatedWallet);

      // 2. Audit: verify we can read back the key and re-derive the same address
      const storedPk = await loadPrivateKey();
      if (!storedPk) {
        throw new Error('Saved private key not found in secure storage.');
      }
      const restored = await importFromPrivateKey(storedPk);
      if (restored.address.toLowerCase() !== generatedWallet.address.toLowerCase()) {
        throw new Error('Wallet verification failed after save. Please retry.');
      }

      // 3. Persist address in async storage + mark onboarding done
      await saveAddress(generatedWallet.address);
      await markOnboardingComplete();

      // 4. Update Zustand state
      setAddress(generatedWallet.address);

      // 5. Show success screen + auto-redirect after 2.5 s
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('success');
      autoRedirectRef.current = setTimeout(() => {
        router.replace('/(tabs)/home');
      }, 2500);

    } catch (e: any) {
      console.error('[create-wallet] save error', e);
      // Revert to show_phrase so user can retry
      setStep('show_phrase');
      Toast.show({
        type:  'error',
        text1: 'Failed to save wallet',
        text2: e?.message ?? 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function copyPhrase() {
    await Clipboard.setStringAsync(mnemonic.join(' '));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({
      type:  'success',
      text1: 'Copied to clipboard',
      text2: 'Store this in a secure location — never share it.',
    });
  }

  // --- Step: Generating ----------------------------------------------------

  if (step === 'generating') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00D4FF" />
          <Text style={styles.loadingTitle}>Generating your wallet...</Text>
          <Text style={styles.loadingSub}>Creating cryptographically secure keys</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Step: Saving --------------------------------------------------------

  if (step === 'saving') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00D4FF" />
          <Text style={styles.loadingTitle}>Saving your wallet...</Text>
          <Text style={styles.loadingSub}>Writing to secure storage — do not close the app</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Step: Success -------------------------------------------------------

  if (step === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <SuccessScreen
          address={walletAddress}
          onContinue={() => {
            if (autoRedirectRef.current) clearTimeout(autoRedirectRef.current);
            router.replace('/(tabs)/home');
          }}
        />
      </SafeAreaView>
    );
  }

  // --- Step: Show phrase ---------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() => safeBack(router)}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 24 }}
        >
          <Ionicons name="arrow-back" size={18} color="#9090B0" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Your Secret Phrase</Text>
        <Text style={styles.subtitle}>
          Write these 12 words down in order and store them somewhere safe.{' '}
          <Text style={styles.danger}>Never share them with anyone.</Text>
        </Text>

        {/* Warning banner */}
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={20} color="#FFB547" style={styles.warnIcon} />
          <Text style={styles.warnText}>
            Anyone with this phrase has full access to your wallet. T Pay
            cannot recover it if lost.
          </Text>
        </View>

        {/* Seed phrase grid */}
        <View style={styles.phraseCard}>
          {phraseHidden ? (
            <TouchableOpacity
              style={styles.revealLayer}
              onPress={() => setPhraseHidden(false)}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="eye-off-outline" size={36} color="#00D4FF" style={styles.revealEye} />
              <Text style={styles.revealTitle}>Tap to reveal seed phrase</Text>
              <Text style={styles.revealSub}>Make sure no one is watching</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.wordsGrid}>
              {mnemonic.map((word, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordNum}>{i + 1}</Text>
                  <Text style={styles.wordText}>{word}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Copy button */}
        {!phraseHidden && (
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={copyPhrase}
            activeOpacity={0.8}
            hitSlop={{ top: 4, bottom: 4 }}
          >
            <Ionicons name="copy-outline" size={17} color="#00D4FF" />
            <Text style={styles.copyBtnText}>Copy to clipboard</Text>
          </TouchableOpacity>
        )}

        {/* Checkbox */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => {
            Haptics.selectionAsync();
            setConfirmed(!confirmed);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4 }}
        >
          <View style={[styles.checkbox, confirmed && styles.checkboxOn]}>
            {confirmed && <Ionicons name="checkmark" size={16} color="#0A0A0F" />}
          </View>
          <Text style={styles.checkLabel}>
            I have written down my seed phrase and understand it cannot be
            recovered if lost.
          </Text>
        </TouchableOpacity>

        {/* Continue CTA */}
        <TouchableOpacity
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={isSaving}
          hitSlop={{ top: 4, bottom: 4 }}
          style={[styles.continueBtn, (!confirmed || isSaving) && styles.continueBtnDisabled]}
        >
          <LinearGradient
            colors={confirmed && !isSaving ? ['#00D4FF', '#0066FF'] : ['#2A2A3A', '#2A2A3A']}
            style={styles.continueGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isSaving ? (
              <ActivityIndicator color="#9090B0" size="small" />
            ) : (
              <Text
                style={[
                  styles.continueBtnText,
                  (!confirmed) && styles.continueBtnTextDim,
                ]}
              >
                I've Saved It — Continue
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A0A0F' },
  scroll:       { padding: 24, paddingBottom: 56 },

  // Loading screens
  center: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            16,
    padding:        32,
  },
  loadingTitle: {
    fontWeight: '700', fontSize:   18,
    color:      '#F0F0FF',
    marginTop:  24,
  },
  loadingSub: {
    fontSize:   14,
    color:      '#9090B0',
    textAlign:  'center',
  },

  // Header
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24, alignSelf: 'flex-start' },
  backText: {
    fontWeight: '500', fontSize:   15,
    color:      '#9090B0',
  },
  title: {
    fontWeight: '700', fontSize:    26,
    color:       '#F0F0FF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize:    14,
    color:       '#9090B0',
    lineHeight:  22,
    marginBottom: 20,
  },
  danger: { color: '#FF4D6A' },

  // Warning banner
  warnBanner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: 'rgba(255,77,106,0.1)',
    borderWidth:     1,
    borderColor:     'rgba(255,77,106,0.25)',
    borderRadius:    12,
    padding:         14,
    marginBottom:    24,
    gap:             10,
  },
  warnIcon: { marginTop: 1 },
  warnText: {
    flex:       1,
    fontSize:   13,
    color:      '#FFB0B8',
    lineHeight: 20,
  },

  // Phrase card
  phraseCard: {
    backgroundColor: '#12121A',
    borderWidth:     1,
    borderColor:     '#2A2A3A',
    borderRadius:    16,
    overflow:        'hidden',
    marginBottom:    16,
    minHeight:       200,
  },
  revealLayer: {
    alignItems:     'center',
    justifyContent: 'center',
    padding:        40,
    gap:            8,
  },
  revealEye:  { marginBottom: 4 },
  revealTitle: {
    fontWeight: '700', fontSize:   16,
    color:      '#F0F0FF',
  },
  revealSub: {
    fontSize:   13,
    color:      '#9090B0',
  },

  wordsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    padding:       16,
    gap:           8,
  },
  wordChip: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor:'#1A1A26',
    borderWidth:    1,
    borderColor:    '#2A2A3A',
    borderRadius:   10,
    paddingHorizontal: 12,
    paddingVertical:   8,
    width:          '30%',
    gap:            6,
  },
  wordNum: {
    fontFamily: 'SpaceMono-Regular',
    fontSize:   10,
    color:      '#5050A0',
    minWidth:   14,
  },
  wordText: {
    fontWeight: '700', fontSize:   13,
    color:      '#F0F0FF',
  },

  // Copy
  copyBtn: {
    alignItems:      'center',
    paddingVertical: 14,
    borderWidth:     1,
    borderColor:     '#2A2A3A',
    borderRadius:    12,
    marginBottom:    24,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  copyBtnText: {
    fontWeight: '500', fontSize:   14,
    color:      '#9090B0',
  },

  // Checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
    marginBottom:  28,
  },
  checkbox: {
    width:          24,
    height:         24,
    borderRadius:   8,
    borderWidth:    2,
    borderColor:    '#3A3A50',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    marginTop:      2,
  },
  checkboxOn: {
    backgroundColor: '#00D4FF',
    borderColor:     '#00D4FF',
  },
  checkmark: {
    color:      '#0A0A0F',
    fontSize:   14,
    fontWeight: '700', },
  checkLabel: {
    flex:       1,
    fontSize:   13,
    color:      '#9090B0',
    lineHeight: 20,
  },

  // Continue button
  continueBtn:         { borderRadius: 16, overflow: 'hidden' },
  continueBtnDisabled: { opacity: 0.6 },
  continueGrad:        { paddingVertical: 18, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  continueBtnText: {
    fontWeight: '700', fontSize:   16,
    color:      '#fff',
  },
  continueBtnTextDim: { color: '#9090B0' },

  // -- Success Screen --------------------------------------------------------
  successContainer: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap:            32,
  },
  successRingWrap: {
    position:       'relative',
    alignItems:     'center',
    justifyContent: 'center',
  },
  successRing: {
    width:          100,
    height:         100,
    borderRadius:   50,
    alignItems:     'center',
    justifyContent: 'center',
  },
  successCheck: {
    fontSize:   48,
    color:      '#fff',
    fontWeight: '700',
  },
  successGlowRing: {
    position:        'absolute',
    width:           128,
    height:          128,
    borderRadius:    64,
    borderWidth:     2,
    borderColor:     'rgba(0, 232, 143, 0.2)',
    backgroundColor: 'rgba(0, 232, 143, 0.04)',
  },

  successTextWrap: {
    alignItems: 'center',
    gap:        10,
  },
  successTitle: {
    fontWeight: '700', fontSize:   28,
    color:      '#F0F0FF',
  },
  successSub: {
    fontSize:   15,
    color:      '#9090B0',
    textAlign:  'center',
    lineHeight: 22,
  },
  successAddressPill: {
    marginTop:       12,
    backgroundColor: '#12121A',
    borderWidth:     1,
    borderColor:     '#2A2A3A',
    borderRadius:    12,
    paddingVertical:   10,
    paddingHorizontal: 18,
    alignItems:        'center',
    gap:               4,
  },
  successAddressLabel: {
    fontSize:      11,
    color:         '#9090B0',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  successAddressValue: {
    fontFamily: 'SpaceMono-Regular',
    fontSize:   13,
    color:      '#00D4FF',
  },
  successHint: {
    marginTop:  8,
    fontSize:   12,
    color:      '#5050A0',
    textAlign:  'center',
  },

  successBtnWrap: { width: '100%' },
  successBtn:     { borderRadius: 16, overflow: 'hidden', width: '100%' },
  successBtnGrad: {
    paddingVertical: 18,
    alignItems:      'center',
    borderRadius:    16,
  },
  successBtnText: {
    fontWeight: '700', fontSize:   16,
    color:      '#fff',
  },
});






import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { getPinAttemptState, unlockWithBiometric, verifyPin } from '@/services/securityService';

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['blank', '0', 'delete'],
] as const;

function PinDots({ length }: { length: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} style={[styles.dot, index < length && styles.dotFilled]} />
      ))}
    </View>
  );
}

export default function LockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  async function refreshAttemptState() {
    const state = await getPinAttemptState();
    setLockedSeconds(Math.ceil(state.remainingLockMs / 1000));
  }

  useEffect(() => {
    refreshAttemptState();
    const timer = setInterval(refreshAttemptState, 1000);
    return () => clearInterval(timer);
  }, []);

  function goHome() {
    router.replace('/(tabs)/home');
  }

  function handleKey(key: string) {
    if (busy || lockedSeconds > 0) return;
    if (key === 'blank') return;
    if (key === 'delete') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (/^\d$/.test(key)) {
      setPin((current) => (current.length < 6 ? `${current}${key}` : current));
    }
  }

  async function handleBiometric() {
    if (busy || lockedSeconds > 0) return;
    setBusy(true);
    try {
      const ok = await unlockWithBiometric();
      if (ok) goHome();
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    if (busy || pin.length < 4 || lockedSeconds > 0) return;
    setBusy(true);
    try {
      await verifyPin(pin);
      setPin('');
      goHome();
    } catch (err: any) {
      Alert.alert('Unlock failed', err?.message ?? 'Try again.');
      setPin('');
      await refreshAttemptState();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.lockIcon}>
          <Ionicons name="shield-checkmark-outline" size={36} color={Colors.primary} />
        </View>
        <Text style={styles.title}>T Pay Locked</Text>
        <Text style={styles.subtitle}>Enter your PIN to unlock wallet actions.</Text>

        <View style={styles.pinPanel}>
          <PinDots length={pin.length} />
          {lockedSeconds > 0 ? <Text style={styles.warning}>Try again in {lockedSeconds}s</Text> : <Text style={styles.pinHint}>{pin.length}/6 digits</Text>}
        </View>

        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keypadRow}>
              {row.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => handleKey(key)}
                  disabled={busy || lockedSeconds > 0 || key === 'blank'}
                  style={({ pressed }) => [
                    styles.key,
                    key === 'delete' && styles.utilityKey,
                    key === 'blank' && styles.keyBlank,
                    pressed && styles.keyPressed,
                    (busy || lockedSeconds > 0) && key !== 'blank' && styles.keyDisabled,
                  ]}
                >
                  {key === 'delete' ? <Ionicons name="backspace-outline" size={22} color={Colors.text2} /> : null}
                  {/^\d$/.test(key) ? <Text style={styles.keyText}>{key}</Text> : null}
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        <Button label="Unlock" loading={busy} disabled={pin.length < 4 || lockedSeconds > 0 || busy} onPress={handleUnlock} />
        <TouchableOpacity style={styles.bioBtn} onPress={handleBiometric} disabled={busy || lockedSeconds > 0}>
          <Ionicons name="finger-print-outline" size={18} color={Colors.primary} />
          <Text style={styles.bioText}>Use biometric unlock</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md },
  lockIcon: { width: 76, height: 76, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.28)' },
  title: { color: Colors.text1, fontSize: 32, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  subtitle: { color: Colors.text2, fontSize: FontSize.md, lineHeight: 22, textAlign: 'center' },
  pinPanel: { borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  dotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pinHint: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800' },
  warning: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '800' },
  keypad: { gap: 10 },
  keypadRow: { flexDirection: 'row', gap: 10 },
  key: { flex: 1, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  utilityKey: { backgroundColor: 'rgba(255,255,255,0.04)' },
  keyBlank: { opacity: 0, backgroundColor: 'transparent', borderColor: 'transparent' },
  keyPressed: { transform: [{ scale: 0.97 }], borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  keyDisabled: { opacity: 0.45 },
  keyText: { color: Colors.text1, fontSize: 24, fontWeight: '800' },
  bioBtn: { alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  bioText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '800' },
});



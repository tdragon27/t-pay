import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { canUseBiometrics, setupPin, validatePinFormat } from '@/services/securityService';

type PinStep = 'pin' | 'confirm';

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['back', '0', 'delete'],
] as const;

function PinDots({ length, active }: { length: number; active: boolean }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            index < length && styles.dotFilled,
            active && index === Math.min(length, 5) && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

export default function PinSetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<PinStep>('pin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    canUseBiometrics()
      .then(setBiometricAvailable)
      .catch(() => setBiometricAvailable(false));
  }, []);

  const activeValue = step === 'pin' ? pin : confirmPin;
  const canContinue = step === 'pin' ? validatePinFormat(pin) : validatePinFormat(confirmPin);
  const helperText = useMemo(() => {
    if (step === 'pin') return 'Choose a 4 to 6 digit PIN. This keypad avoids iOS input glitches.';
    return 'Enter the same PIN again to confirm security setup.';
  }, [step]);

  function setActiveValue(next: string) {
    if (step === 'pin') setPin(next);
    else setConfirmPin(next);
  }

  function handleKey(key: string) {
    if (saving) return;
    if (key === 'back') {
      if (step === 'confirm') {
        setConfirmPin('');
        setStep('pin');
      }
      return;
    }
    if (key === 'delete') {
      setActiveValue(activeValue.slice(0, -1));
      return;
    }
    if (/^\d$/.test(key) && activeValue.length < 6) {
      setActiveValue(`${activeValue}${key}`);
    }
  }

  async function handlePrimary() {
    if (step === 'pin') {
      if (!validatePinFormat(pin)) return Alert.alert('Invalid PIN', 'Use a 4 to 6 digit PIN.');
      setStep('confirm');
      return;
    }

    if (!validatePinFormat(confirmPin)) return Alert.alert('Invalid PIN', 'Use a 4 to 6 digit PIN.');
    if (pin !== confirmPin) {
      setConfirmPin('');
      return Alert.alert('PIN mismatch', 'Confirm PIN must match. Please enter it again.');
    }

    setSaving(true);
    try {
      await setupPin(pin, biometricAvailable && biometricEnabled);
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Could not save PIN', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={styles.headerRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="lock-closed-outline" size={30} color={Colors.primary} />
          </View>
          <View style={styles.stepPill}>
            <Text style={styles.stepPillText}>{step === 'pin' ? 'Step 1 of 2' : 'Step 2 of 2'}</Text>
          </View>
        </View>

        <Text style={styles.title}>Secure T Pay</Text>
        <Text style={styles.subtitle}>Protect Send, Swap, seed export, and invoice controls before using the wallet.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{step === 'pin' ? 'Create PIN' : 'Confirm PIN'}</Text>
          <Text style={styles.helper}>{helperText}</Text>
          <View style={styles.pinPanel}>
            <PinDots length={activeValue.length} active />
            <Text style={styles.pinHint}>{activeValue.length}/6 digits</Text>
          </View>

          <View style={styles.bioRow}>
            <View style={styles.bioCopy}>
              <Text style={styles.bioTitle}>Biometric unlock</Text>
              <Text style={styles.bioSub}>{biometricAvailable ? 'Use Face ID / Touch ID when available.' : 'No enrolled biometric found.'}</Text>
            </View>
            <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} disabled={!biometricAvailable || saving} />
          </View>
        </View>

        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keypadRow}>
              {row.map((key) => {
                const isUtility = key === 'back' || key === 'delete';
                const icon = key === 'back' ? 'arrow-back-outline' : 'backspace-outline';
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleKey(key)}
                    disabled={saving || (key === 'back' && step === 'pin')}
                    style={({ pressed }) => [
                      styles.key,
                      isUtility && styles.utilityKey,
                      pressed && styles.keyPressed,
                      saving && styles.keyDisabled,
                      key === 'back' && step === 'pin' && styles.keyHidden,
                    ]}
                  >
                    {isUtility ? <Ionicons name={icon as any} size={22} color={Colors.text2} /> : <Text style={styles.keyText}>{key}</Text>}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <Button
          label={step === 'pin' ? 'Continue' : 'Enable Security'}
          loading={saving}
          disabled={!canContinue || saving}
          onPress={handlePrimary}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,212,255,0.28)' },
  stepPill: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.elevated, paddingHorizontal: 14, paddingVertical: 8 },
  stepPillText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: Colors.text1, fontSize: 34, fontWeight: '800', letterSpacing: -0.8, marginTop: Spacing.sm },
  subtitle: { color: Colors.text2, fontSize: FontSize.md, lineHeight: 22 },
  card: { borderRadius: 28, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: Spacing.lg, gap: Spacing.md },
  label: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  helper: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  pinPanel: { borderRadius: 22, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotActive: { borderColor: Colors.text1, transform: [{ scale: 1.08 }] },
  pinHint: { color: Colors.text3, fontSize: FontSize.xs, fontWeight: '800' },
  bioRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: 2 },
  bioCopy: { flex: 1 },
  bioTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  bioSub: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 4 },
  keypad: { gap: 10, marginTop: Spacing.xs },
  keypadRow: { flexDirection: 'row', gap: 10 },
  key: { flex: 1, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  utilityKey: { backgroundColor: 'rgba(255,255,255,0.04)' },
  keyPressed: { transform: [{ scale: 0.97 }], borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  keyDisabled: { opacity: 0.5 },
  keyHidden: { opacity: 0 },
  keyText: { color: Colors.text1, fontSize: 24, fontWeight: '800' },
});




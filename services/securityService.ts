import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { randomBytes, sha256, toUtf8Bytes } from 'ethers';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';
import { wipeWallet } from '@/lib/wallet';

const PIN_HASH_KEY = 'tpay_pin_hash_v1';
const PIN_SALT_KEY = 'tpay_pin_salt_v1';
const BIOMETRIC_KEY = 'tpay_biometric_enabled_v1';
const DEFAULT_AUTO_LOCK_MS = 2 * 60 * 1000;
const SOFT_LOCK_ATTEMPTS = 5;
const WIPE_ATTEMPTS = 10;
const PIN_LOCK_MS = 30_000;

export function isPinSecurityEnabled() {
  // Web preview wallets are intentionally session-only. Native SecureStore,
  // biometric authentication, and persistent PIN protection are unavailable.
  if (Platform.OS === 'web') return false;
  const raw = String(process.env.EXPO_PUBLIC_PIN_SECURITY_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled', 'no'].includes(raw);
}

export interface SecuritySettings {
  autoLockMs: number;
  biometricEnabled: boolean;
}

let runtimeLocked = false;
let lastActiveAt = Date.now();

function makeSalt() {
  return Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hashPin(pin: string, salt: string) {
  return sha256(toUtf8Bytes(`${salt}:${pin}`));
}

export function markUserActivity() {
  lastActiveAt = Date.now();
}

export function getLastActiveAt() {
  return lastActiveAt;
}

export async function loadSecuritySettings(): Promise<SecuritySettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.SECURITY_SETTINGS);
  let stored: Partial<SecuritySettings> = {};
  if (raw) {
    try { stored = JSON.parse(raw); } catch { stored = {}; }
  }
  const biometricFlag = Platform.OS === 'web'
    ? null
    : await SecureStore.getItemAsync(BIOMETRIC_KEY);
  return {
    autoLockMs: stored.autoLockMs ?? DEFAULT_AUTO_LOCK_MS,
    biometricEnabled: stored.biometricEnabled ?? biometricFlag === '1',
  };
}

export async function saveSecuritySettings(settings: Partial<SecuritySettings>) {
  const current = await loadSecuritySettings();
  const next = { ...current, ...settings };
  await AsyncStorage.setItem(STORAGE_KEYS.SECURITY_SETTINGS, JSON.stringify(next));
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, next.biometricEnabled ? '1' : '0', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return next;
}

export async function hasPinSetup() {
  if (!isPinSecurityEnabled()) return true;
  const hash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
  return Boolean(hash && salt);
}

export function validatePinFormat(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

export async function setupPin(pin: string, biometricEnabled = false) {
  if (Platform.OS === 'web') {
    throw new Error('PIN and biometric protection are available in the T Pay mobile app.');
  }
  if (!validatePinFormat(pin)) throw new Error('PIN must be 4 to 6 digits.');
  const salt = makeSalt();
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(pin, salt), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await saveSecuritySettings({ biometricEnabled });
  await resetPinAttempts();
  await setAppLocked(false);
}

export async function getPinAttemptState() {
  const attempts = Number(await AsyncStorage.getItem(STORAGE_KEYS.PIN_ATTEMPTS)) || 0;
  const lockedUntil = Number(await AsyncStorage.getItem(STORAGE_KEYS.PIN_LOCK_UNTIL)) || 0;
  return { attempts, lockedUntil, remainingLockMs: Math.max(0, lockedUntil - Date.now()) };
}

export async function resetPinAttempts() {
  await AsyncStorage.multiRemove([STORAGE_KEYS.PIN_ATTEMPTS, STORAGE_KEYS.PIN_LOCK_UNTIL]);
}

export async function verifyPin(pin: string) {
  if (Platform.OS === 'web') return true;
  const state = await getPinAttemptState();
  if (state.remainingLockMs > 0) {
    throw new Error(`Too many failed attempts. Try again in ${Math.ceil(state.remainingLockMs / 1000)}s.`);
  }

  const [salt, expected] = await Promise.all([
    SecureStore.getItemAsync(PIN_SALT_KEY),
    SecureStore.getItemAsync(PIN_HASH_KEY),
  ]);
  if (!salt || !expected) throw new Error('PIN is not set up.');

  const ok = hashPin(pin, salt) === expected;
  if (ok) {
    await resetPinAttempts();
    await setAppLocked(false);
    return true;
  }

  const attempts = state.attempts + 1;
  await AsyncStorage.setItem(STORAGE_KEYS.PIN_ATTEMPTS, String(attempts));
  if (attempts >= WIPE_ATTEMPTS) {
    await wipeWallet();
    await AsyncStorage.clear();
    throw new Error('Wallet wiped after 10 failed PIN attempts.');
  }
  if (attempts >= SOFT_LOCK_ATTEMPTS) {
    await AsyncStorage.setItem(STORAGE_KEYS.PIN_LOCK_UNTIL, String(Date.now() + PIN_LOCK_MS));
    throw new Error('Too many failed attempts. Locked for 30 seconds.');
  }
  throw new Error(`Incorrect PIN. ${WIPE_ATTEMPTS - attempts} attempts before wipe.`);
}

export async function canUseBiometrics() {
  if (Platform.OS === 'web') return false;
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}

export async function unlockWithBiometric() {
  if (Platform.OS === 'web') return false;
  const settings = await loadSecuritySettings();
  if (!settings.biometricEnabled) return false;
  if (!(await canUseBiometrics())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock T Pay',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: false,
  });
  if (result.success) {
    await resetPinAttempts();
    await setAppLocked(false);
    return true;
  }
  return false;
}

export async function setAppLocked(locked: boolean) {
  const nextLocked = isPinSecurityEnabled() ? locked : false;
  runtimeLocked = nextLocked;
  if (!nextLocked) markUserActivity();
  await AsyncStorage.setItem(STORAGE_KEYS.APP_LOCKED, nextLocked ? '1' : '0');
}

export async function isAppLocked() {
  if (!isPinSecurityEnabled()) return false;
  const persisted = await AsyncStorage.getItem(STORAGE_KEYS.APP_LOCKED);
  return runtimeLocked || persisted === '1';
}

export async function lockIfInactive() {
  if (!isPinSecurityEnabled()) return false;
  const settings = await loadSecuritySettings();
  if (Date.now() - lastActiveAt >= settings.autoLockMs) {
    await setAppLocked(true);
    return true;
  }
  return false;
}

export async function ensureCriticalAuth() {
  if (!isPinSecurityEnabled()) return true;
  if (!(await hasPinSetup())) throw new Error('Set up PIN security before this action.');
  if (await isAppLocked()) throw new Error('Unlock T Pay before this action.');
  markUserActivity();
  return true;
}



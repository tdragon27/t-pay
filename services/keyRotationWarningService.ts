import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export interface KeyRotationFinding {
  key: string;
  reason: string;
}

const PUBLIC_ENV_KEYS = [
  'EXPO_PUBLIC_CIRCLE_APP_KIT_KEY',
  'EXPO_PUBLIC_ARC_RPC_URL',
  'EXPO_PUBLIC_ARC_USDC_ADDRESS',
  'EXPO_PUBLIC_INVOICE_ADDRESS',
  'EXPO_PUBLIC_RECURRING_ADDRESS',
  'EXPO_PUBLIC_PASSPORT_ANCHOR_ADDRESS',
];

function valueFor(key: string) {
  return process.env[key as keyof typeof process.env] as string | undefined;
}

function inspectValue(key: string, value?: string): KeyRotationFinding | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('your_') || lower.includes('changeme') || lower.includes('placeholder')) return { key, reason: 'Placeholder value is still configured.' };
  if (raw === '0x...' || /^0x0{40}$/i.test(raw)) return { key, reason: 'Address placeholder or zero address detected.' };
  if (key.includes('KEY') && lower.includes('test_key')) return { key, reason: 'Known test key marker detected.' };
  return null;
}

export async function inspectPublicEnvForWarnings() {
  const findings = PUBLIC_ENV_KEYS.map((key) => inspectValue(key, valueFor(key))).filter(Boolean) as KeyRotationFinding[];
  await AsyncStorage.setItem(STORAGE_KEYS.KEY_ROTATION_FINDINGS, JSON.stringify(findings));
  return findings;
}

export async function loadKeyRotationFindings(): Promise<KeyRotationFinding[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.KEY_ROTATION_FINDINGS);
  if (!raw) return inspectPublicEnvForWarnings();
  try {
    return JSON.parse(raw) as KeyRotationFinding[];
  } catch {
    return inspectPublicEnvForWarnings();
  }
}

export async function markKeyRotationWarningSeen() {
  await AsyncStorage.setItem(STORAGE_KEYS.KEY_ROTATION_WARNING_SEEN, 'true');
}

export async function hasSeenKeyRotationWarning() {
  return (await AsyncStorage.getItem(STORAGE_KEYS.KEY_ROTATION_WARNING_SEEN)) === 'true';
}

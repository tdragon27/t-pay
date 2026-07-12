import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { isSafeOpenUrl, redactUrlForLog } from '@/utils/tpayLogic';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getArcExplorerTxUrl(txHash: string) {
  const base = trimTrailingSlash(process.env.EXPO_PUBLIC_ARC_EXPLORER ?? ARC_TESTNET_DEFAULTS.EXPLORER_URL);
  return `${base}/tx/${txHash}`;
}

export async function safeOpenUrl(url?: string | null, label = 'Link'): Promise<boolean> {
  const nextUrl = url?.trim();
  if (!nextUrl) {
    Toast.show({ type: 'error', text1: `${label} is missing` });
    return false;
  }

  if (!isSafeOpenUrl(nextUrl)) {
    Toast.show({
      type: 'error',
      text1: `Could not open ${label}`,
      text2: 'Unsupported or unsafe link.',
    });
    return false;
  }

  try {
    await Linking.openURL(nextUrl);
    return true;
  } catch (error) {
    console.warn('[safeOpenUrl] Failed to open safe URL:', redactUrlForLog(nextUrl), error instanceof Error ? error.message : 'unknown error');
    try {
      await Clipboard.setStringAsync(nextUrl);
      Toast.show({
        type: 'info',
        text1: `Could not open ${label}`,
        text2: 'The link was copied to clipboard.',
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: `Could not open ${label}`,
        text2: 'Please try again from the details screen.',
      });
    }
    return false;
  }
}

export async function safeOpenTx(txHash?: string | null): Promise<boolean> {
  if (!txHash) return safeOpenUrl(null, 'Arc explorer');
  return safeOpenUrl(getArcExplorerTxUrl(txHash), 'Arc explorer');
}
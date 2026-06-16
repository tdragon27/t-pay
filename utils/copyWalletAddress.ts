import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { shortenAddress } from '@/utils/format';

interface CopyWalletOptions {
  title?: string;
  subtitle?: string;
}

export async function copyWalletAddress(address?: string | null, options: CopyWalletOptions = {}): Promise<boolean> {
  const walletAddress = address?.trim();
  if (!walletAddress) {
    Toast.show({ type: 'error', text1: 'No wallet address to copy' });
    return false;
  }

  try {
    await Clipboard.setStringAsync(walletAddress);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Toast.show({
      type: 'success',
      text1: options.title ?? 'Wallet copied',
      text2: options.subtitle ?? shortenAddress(walletAddress, 8),
    });
    return true;
  } catch (error) {
    console.warn('[copyWalletAddress] Failed to copy wallet address:', error);
    Toast.show({ type: 'error', text1: 'Could not copy wallet', text2: 'Please try again.' });
    return false;
  }
}

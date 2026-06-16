import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { isArcAppKitConfigured } from '@/lib/arcAppKit';

export interface GasSponsorshipStatus {
  enabled: boolean;
  appKitReady: boolean;
  paymasterUrl?: string;
  smartWalletEnabled: boolean;
  chainId: number;
  status: 'ready' | 'configured' | 'incomplete' | 'disabled';
  message: string;
  missing: string[];
}

function hasConfiguredValue(value?: string) {
  return Boolean(value && value.trim() && !value.includes('your_') && value !== '0x...');
}

export function getGasSponsorshipStatus(): GasSponsorshipStatus {
  const paymasterUrl = process.env.EXPO_PUBLIC_CIRCLE_PAYMASTER_URL;
  const appKitReady = isArcAppKitConfigured();
  const smartWalletEnabled = process.env.EXPO_PUBLIC_TPAY_SMART_WALLET_ENABLED === 'true';
  const sponsorshipEnabled = process.env.EXPO_PUBLIC_TPAY_GAS_SPONSORSHIP_ENABLED === 'true';
  const missing: string[] = [];

  if (!sponsorshipEnabled) missing.push('EXPO_PUBLIC_TPAY_GAS_SPONSORSHIP_ENABLED=true');
  if (!smartWalletEnabled) missing.push('EXPO_PUBLIC_TPAY_SMART_WALLET_ENABLED=true');
  if (!hasConfiguredValue(paymasterUrl)) missing.push('EXPO_PUBLIC_CIRCLE_PAYMASTER_URL');
  if (!appKitReady) missing.push('EXPO_PUBLIC_CIRCLE_APP_KIT_KEY');

  const ready = missing.length === 0;
  const configured = hasConfiguredValue(paymasterUrl) || smartWalletEnabled || sponsorshipEnabled;

  return {
    enabled: sponsorshipEnabled,
    appKitReady,
    paymasterUrl: hasConfiguredValue(paymasterUrl) ? paymasterUrl : undefined,
    smartWalletEnabled,
    chainId: ARC_TESTNET_DEFAULTS.CHAIN_ID,
    status: ready ? 'ready' : configured ? 'configured' : 'disabled',
    missing,
    message: ready
      ? 'Sponsored transaction readiness is configured. Execute only through a tested smart-wallet/paymaster flow.'
      : configured
        ? 'Gas sponsorship is partially configured. Keep normal Arc USDC gas execution as fallback.'
        : 'Gas sponsorship is disabled. Arc transactions continue to use native USDC gas.',
  };
}

export function assertSponsoredExecutionReady() {
  const status = getGasSponsorshipStatus();
  if (status.status !== 'ready') {
    throw new Error(`Sponsored execution is not ready: ${status.missing.join(', ')}`);
  }
  return status;
}

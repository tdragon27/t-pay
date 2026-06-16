import { ARC_CONTRACTS, ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { isArcAppKitConfigured } from '@/lib/arcAppKit';

export interface ArcCapabilityStatus {
  id: string;
  label: string;
  status: 'ready' | 'configured' | 'missing' | 'optional';
  description: string;
}

function hasValue(value?: string) {
  return Boolean(value && value.trim() && !value.includes('your_') && value !== '0x...');
}

export function getArcCapabilityStatus(): ArcCapabilityStatus[] {
  const appKitReady = isArcAppKitConfigured();
  const backendReady = hasValue(process.env.EXPO_PUBLIC_TPAY_BACKEND_URL);
  const paymasterReady = hasValue(process.env.EXPO_PUBLIC_CIRCLE_PAYMASTER_URL);
  const settlementReady = hasValue(ARC_CONTRACTS.MERCHANT_SETTLEMENT);
  const dexReady = hasValue(ARC_CONTRACTS.DEX_ROUTER);

  return [
    {
      id: 'arc-testnet',
      label: 'Arc Testnet',
      status: 'ready',
      description: `Chain ${ARC_TESTNET_DEFAULTS.CHAIN_ID}, gas paid with USDC.`,
    },
    {
      id: 'app-kit',
      label: 'Circle App Kit',
      status: appKitReady ? 'ready' : 'missing',
      description: appKitReady ? 'Send, Bridge, Swap, Unified Balance can use App Kit.' : 'Set EXPO_PUBLIC_APP_KIT_PROJECT_ID or EXPO_PUBLIC_CIRCLE_APP_KIT_KEY.',
    },
    {
      id: 'paymaster',
      label: 'Gas sponsorship',
      status: paymasterReady ? 'configured' : 'optional',
      description: paymasterReady
        ? 'Paymaster URL is configured. Full sponsored UserOperation flow still requires smart-wallet execution.'
        : 'Optional: configure a paymaster/smart-wallet provider before claiming sponsored gas.',
    },
    {
      id: 'merchant-indexer',
      label: 'Merchant indexer',
      status: backendReady ? 'ready' : 'optional',
      description: backendReady ? 'Backend sync and analytics API are enabled.' : 'Local invoices still work; backend enables cross-device history.',
    },
    {
      id: 'settlement-contract',
      label: 'Settlement contract',
      status: settlementReady ? 'ready' : 'optional',
      description: settlementReady ? 'Invoices can be created and paid through the onchain settlement contract.' : 'Transfer-mode invoices still work without contract.',
    },
    {
      id: 'dex-router',
      label: 'DEX routing',
      status: dexReady ? 'ready' : 'optional',
      description: dexReady ? 'DEX fallback routes can execute onchain.' : 'App Kit StableFX remains primary for supported pairs.',
    },
  ];
}


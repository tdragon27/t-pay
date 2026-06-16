// services/debugService.ts
// Support-safe debug snapshot. Never includes seed phrase, private key, API keys, or full secret-like env values.

import { ARC_CONTRACTS, TOKEN_ADDRESSES, arcTestnet } from '@/constants/chains';
import { getArcCapabilityStatus } from '@/services/capabilityService';
import { isArcAppKitConfigured } from '@/lib/arcAppKit';

function configured(value?: string) {
  return Boolean(value && value.trim() && value !== '0x...' && !value.includes('your_'));
}

function status(value?: string) {
  return configured(value) ? 'configured' : 'missing';
}

function short(value?: string | null) {
  if (!value) return 'not connected';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function buildDebugInfo(address?: string | null) {
  const capabilities = getArcCapabilityStatus()
    .map((item) => `${item.label}: ${item.status}`)
    .join('\n');

  return [
    'T Pay Debug Info',
    'Support-safe: no seed phrase, private key, API key, or raw secret env value is included.',
    `Generated: ${new Date().toISOString()}`,
    `Wallet: ${short(address)}`,
    `Environment: ${process.env.EXPO_PUBLIC_ENV ?? 'testnet'}`,
    `Arc chain id: ${arcTestnet.id}`,
    `Arc RPC: ${status(process.env.EXPO_PUBLIC_ARC_RPC_URL)}`,
    `Arc explorer: ${status(process.env.EXPO_PUBLIC_ARC_EXPLORER)}`,
    `USDC token configured: ${configured(TOKEN_ADDRESSES.ARC_USDC)}`,
    `EURC token configured: ${configured(TOKEN_ADDRESSES.ARC_EURC)}`,
    `cirBTC token configured: ${configured(TOKEN_ADDRESSES.ARC_CIRBTC)}`,
    `DEX router configured: ${configured(ARC_CONTRACTS.DEX_ROUTER)}`,
    `Merchant settlement configured: ${configured(ARC_CONTRACTS.MERCHANT_SETTLEMENT)}`,
    `Backend configured: ${configured(process.env.EXPO_PUBLIC_TPAY_BACKEND_URL)}`,
    `Circle App Kit configured: ${isArcAppKitConfigured()}`,
    '',
    'Capabilities:',
    capabilities,
  ].join('\n');
}



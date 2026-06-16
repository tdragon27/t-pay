// constants/tokens.ts
// Central Arc Testnet token registry for T Pay.
// Official sources verified on 2026-06-03:
// - USDC/EURC: https://docs.arc.io/arc/references/contract-addresses
// - cirBTC: https://developers.circle.com/assets/cirbtc-contract-addresses
// Onchain metadata was also verified through Arc Testnet RPC decimals()/symbol()/name().

export type SupportedArcTokenSymbol = 'USDC' | 'EURC' | 'cirBTC';

export interface ArcTestnetTokenConfig {
  symbol: SupportedArcTokenSymbol;
  name: string;
  contractAddress: `0x${string}`;
  decimals: number;
  displayDecimals: number;
  iconLabel: string;
  accent: string;
  network: 'Arc Testnet';
  faucetSupported: true;
  docsUrl: string;
}

export const ARC_TESTNET_TOKENS = {
  USDC: {
    symbol: 'USDC',
    name: 'USDC',
    contractAddress: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    displayDecimals: 2,
    iconLabel: '$',
    accent: '#6FA8FF',
    network: 'Arc Testnet',
    faucetSupported: true,
    docsUrl: 'https://docs.arc.io/arc/references/contract-addresses',
  },
  EURC: {
    symbol: 'EURC',
    name: 'EURC',
    contractAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    decimals: 6,
    displayDecimals: 2,
    iconLabel: 'E',
    accent: '#8B79FF',
    network: 'Arc Testnet',
    faucetSupported: true,
    docsUrl: 'https://docs.arc.io/arc/references/contract-addresses',
  },
  cirBTC: {
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    contractAddress: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
    decimals: 8,
    displayDecimals: 6,
    iconLabel: 'B',
    accent: '#19E6FF',
    network: 'Arc Testnet',
    faucetSupported: true,
    docsUrl: 'https://developers.circle.com/assets/cirbtc-contract-addresses',
  },
} as const satisfies Record<SupportedArcTokenSymbol, ArcTestnetTokenConfig>;

export const SUPPORTED_ARC_TESTNET_TOKENS = [
  ARC_TESTNET_TOKENS.USDC,
  ARC_TESTNET_TOKENS.EURC,
  ARC_TESTNET_TOKENS.cirBTC,
] as const;

export function isSupportedArcTokenSymbol(value: unknown): value is SupportedArcTokenSymbol {
  return typeof value === 'string' && value in ARC_TESTNET_TOKENS;
}

export function getArcTestnetToken(symbol: SupportedArcTokenSymbol): ArcTestnetTokenConfig {
  return ARC_TESTNET_TOKENS[symbol];
}

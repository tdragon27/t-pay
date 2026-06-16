import { defineChain } from 'viem';

// Arc docs used:
// - https://docs.arc.io/llms.txt
// - https://docs.arc.io/integrate/connect-to-arc
// - https://docs.arc.io/arc/references/contract-addresses
// - https://docs.arc.io/app-kit
// Arc Testnet uses USDC as the native gas token. Native gas accounting uses
// 18 decimals; the optional ERC-20 USDC interface uses 6 decimals.
export const ARC_DOCS = {
  LLMS_INDEX: 'https://docs.arc.io/llms.txt',
  CONNECT_TO_ARC: 'https://docs.arc.io/integrate/connect-to-arc',
  CONTRACT_ADDRESSES: 'https://docs.arc.io/arc/references/contract-addresses',
  APP_KIT: 'https://docs.arc.io/app-kit',
} as const;

export const ARC_TESTNET_DEFAULTS = {
  CHAIN_ID: 5042002,
  RPC_URL: 'https://rpc.testnet.arc.network',
  WS_URL: 'wss://rpc.testnet.arc.network',
  EXPLORER_URL: 'https://testnet.arcscan.app',
  FAUCET_URL: 'https://faucet.circle.com',
} as const;

export const ARC_OFFICIAL_CONTRACTS = {
  USDC_ERC20: '0x3600000000000000000000000000000000000000',
  EURC_ERC20: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  CIRBTC_ERC20: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
  CCTP_TOKEN_MESSENGER_V2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  CCTP_MESSAGE_TRANSMITTER_V2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  CCTP_TOKEN_MINTER_V2: '0xb43db544E2c27092c107639Ad201b3dEfAbcF192',
  GATEWAY_WALLET: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
  GATEWAY_MINTER: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
  STABLEFX_ESCROW: '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
} as const;

export const arcTestnet = defineChain({
  id: Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? ARC_TESTNET_DEFAULTS.CHAIN_ID),
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.EXPO_PUBLIC_ARC_RPC_URL ?? ARC_TESTNET_DEFAULTS.RPC_URL],
      webSocket: [process.env.EXPO_PUBLIC_ARC_WS_URL ?? ARC_TESTNET_DEFAULTS.WS_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: process.env.EXPO_PUBLIC_ARC_EXPLORER ?? ARC_TESTNET_DEFAULTS.EXPLORER_URL,
    },
  },
  testnet: true,
});

export const BRIDGE_CHAINS = [
  { id: 84532, name: 'Base Sepolia', symbol: 'ETH', logo: 'Base', cctpDomain: 6, testnet: true },
  { id: 11155111, name: 'Ethereum Sepolia', symbol: 'ETH', logo: 'Ethereum', cctpDomain: 0, testnet: true },
  { id: 421614, name: 'Arbitrum Sepolia', symbol: 'ETH', logo: 'Arbitrum', cctpDomain: 3, testnet: true },
  { id: 80002, name: 'Polygon Amoy', symbol: 'MATIC', logo: 'Polygon', cctpDomain: 7, testnet: true },
] as const;

export type BridgeChain = (typeof BRIDGE_CHAINS)[number];

export const TOKEN_ADDRESSES = {
  ARC_USDC: (process.env.EXPO_PUBLIC_ARC_USDC_ADDRESS ?? ARC_OFFICIAL_CONTRACTS.USDC_ERC20) as `0x${string}`,
  ARC_USDT: (process.env.EXPO_PUBLIC_ARC_USDT_ADDRESS ?? '') as `0x${string}` | '',
  ARC_EURC: (process.env.EXPO_PUBLIC_ARC_EURC_ADDRESS ?? ARC_OFFICIAL_CONTRACTS.EURC_ERC20) as `0x${string}`,
  ARC_CIRBTC: (process.env.EXPO_PUBLIC_ARC_CIRBTC_ADDRESS ?? ARC_OFFICIAL_CONTRACTS.CIRBTC_ERC20) as `0x${string}`,
  ARC_DAI: (process.env.EXPO_PUBLIC_ARC_DAI_ADDRESS ?? '') as `0x${string}` | '',
  ARC_PYUSD: (process.env.EXPO_PUBLIC_ARC_PYUSD_ADDRESS ?? '') as `0x${string}` | '',
  ARC_WETH: (process.env.EXPO_PUBLIC_ARC_WETH_ADDRESS ?? '') as `0x${string}` | '',
} as const;

export const ARC_NATIVE_USDC_DECIMALS = 18;
export const ARC_USDC_DECIMALS = 6;

export const ARC_CONTRACTS = {
  DEX_ROUTER: (process.env.EXPO_PUBLIC_ARC_DEX_ROUTER_ADDRESS ?? '') as `0x${string}` | '',
  MERCHANT_SETTLEMENT: (process.env.EXPO_PUBLIC_MERCHANT_SETTLEMENT_ADDRESS ?? '') as `0x${string}` | '',
  PREDICTION_MARKETS: (process.env.EXPO_PUBLIC_MARKETS_ADDRESS ?? process.env.EXPO_PUBLIC_PREDICTION_MARKET_ADDRESS ?? '') as `0x${string}` | '',
} as const;

export const FX_TOKENS = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: TOKEN_ADDRESSES.ARC_USDC,
    decimals: 6,
    accent: '#2775CA',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: TOKEN_ADDRESSES.ARC_USDT,
    decimals: 6,
    accent: '#26A17B',
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: TOKEN_ADDRESSES.ARC_EURC,
    decimals: 6,
    accent: '#5C6CFF',
  },
  cirBTC: {
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    address: TOKEN_ADDRESSES.ARC_CIRBTC,
    decimals: 8,
    accent: '#19E6FF',
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: TOKEN_ADDRESSES.ARC_DAI,
    decimals: 18,
    accent: '#F5AC37',
  },
  PYUSD: {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    address: TOKEN_ADDRESSES.ARC_PYUSD,
    decimals: 6,
    accent: '#2C6BFF',
  },
} as const;

export type FxTokenSymbol = keyof typeof FX_TOKENS;
export type FxRouteSymbol = FxTokenSymbol | 'WETH';
export type FxQuoteSource = 'DEX' | 'STABLEFX';
export type FxExecutionMode = 'auto' | 'stablefx' | 'dex';

export const ROUTE_TOKENS: Record<FxRouteSymbol, { symbol: FxRouteSymbol; address: `0x${string}` | ''; decimals: number }> = {
  USDC: { symbol: 'USDC', address: TOKEN_ADDRESSES.ARC_USDC, decimals: 6 },
  USDT: { symbol: 'USDT', address: TOKEN_ADDRESSES.ARC_USDT, decimals: 6 },
  EURC: { symbol: 'EURC', address: TOKEN_ADDRESSES.ARC_EURC, decimals: 6 },
  cirBTC: { symbol: 'cirBTC', address: TOKEN_ADDRESSES.ARC_CIRBTC, decimals: 8 },

  DAI: { symbol: 'DAI', address: TOKEN_ADDRESSES.ARC_DAI, decimals: 18 },
  PYUSD: { symbol: 'PYUSD', address: TOKEN_ADDRESSES.ARC_PYUSD, decimals: 6 },
  WETH: { symbol: 'WETH', address: TOKEN_ADDRESSES.ARC_WETH, decimals: 18 },
};

export interface DexRouteDefinition {
  id: string;
  label: string;
  symbols: FxRouteSymbol[];
}

export const DEX_ROUTE_CONFIG: Partial<Record<`${FxTokenSymbol}_${FxTokenSymbol}`, DexRouteDefinition[]>> = {
  USDC_USDT: [
    { id: 'usdc-usdt-direct', label: 'USDC -> USDT', symbols: ['USDC', 'USDT'] },
    { id: 'usdc-weth-usdt', label: 'USDC -> WETH -> USDT', symbols: ['USDC', 'WETH', 'USDT'] },
  ],
  USDC_EURC: [
    { id: 'usdc-eurc-direct', label: 'USDC -> EURC', symbols: ['USDC', 'EURC'] },
    { id: 'usdc-weth-eurc', label: 'USDC -> WETH -> EURC', symbols: ['USDC', 'WETH', 'EURC'] },
  ],
  USDT_USDC: [
    { id: 'usdt-usdc-direct', label: 'USDT -> USDC', symbols: ['USDT', 'USDC'] },
    { id: 'usdt-weth-usdc', label: 'USDT -> WETH -> USDC', symbols: ['USDT', 'WETH', 'USDC'] },
  ],
  USDT_EURC: [
    { id: 'usdt-eurc-direct', label: 'USDT -> EURC', symbols: ['USDT', 'EURC'] },
    { id: 'usdt-weth-eurc', label: 'USDT -> WETH -> EURC', symbols: ['USDT', 'WETH', 'EURC'] },
  ],
  EURC_USDC: [
    { id: 'eurc-usdc-direct', label: 'EURC -> USDC', symbols: ['EURC', 'USDC'] },
    { id: 'eurc-weth-usdc', label: 'EURC -> WETH -> USDC', symbols: ['EURC', 'WETH', 'USDC'] },
  ],
  EURC_USDT: [
    { id: 'eurc-usdt-direct', label: 'EURC -> USDT', symbols: ['EURC', 'USDT'] },
    { id: 'eurc-weth-usdt', label: 'EURC -> WETH -> USDT', symbols: ['EURC', 'WETH', 'USDT'] },
  ],
};

export function getDexRouteCandidates(fromSymbol: FxTokenSymbol, toSymbol: FxTokenSymbol): DexRouteDefinition[] {
  const key = `${fromSymbol}_${toSymbol}` as const;
  const configured = DEX_ROUTE_CONFIG[key];
  const candidates = configured && configured.length > 0
    ? configured
    : [{ id: `${fromSymbol.toLowerCase()}-${toSymbol.toLowerCase()}-direct`, label: `${fromSymbol} -> ${toSymbol}`, symbols: [fromSymbol, toSymbol] } as DexRouteDefinition];

  return candidates.filter((route) =>
    route.symbols.every((symbol) => {
      const token = ROUTE_TOKENS[symbol];
      return Boolean(token?.address);
    }),
  );
}

export const DERIVATION_PATH = "m/44'/60'/0'/0/0";




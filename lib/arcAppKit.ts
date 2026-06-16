import { AppKit, type BridgeResult, type BridgeStep, type GetBalancesResult, type SwapEstimate, type SwapResult } from '@circle-fin/app-kit';
import { ArbitrumSepolia, ArcTestnet, BaseSepolia, EthereumSepolia, PolygonAmoy } from '@circle-fin/app-kit/chains';
import { ViemAdapter } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_TESTNET_DEFAULTS, arcTestnet, BRIDGE_CHAINS, type BridgeChain, type FxTokenSymbol } from '@/constants/chains';

// Arc docs used:
// - https://docs.arc.io/llms.txt
// - https://docs.arc.io/app-kit
// - https://docs.arc.io/app-kit/send
// - https://docs.arc.io/app-kit/bridge
// - https://docs.arc.io/app-kit/swap
// - https://docs.arc.io/app-kit/unified-balance
// - https://docs.arc.io/app-kit/references/supported-blockchains
// Arc guidance: prefer App Kit for bridge, swap, send, and unified balance.

type AppKitChainName =
  | 'Arc_Testnet'
  | 'Base_Sepolia'
  | 'Ethereum_Sepolia'
  | 'Arbitrum_Sepolia'
  | 'Polygon_Amoy_Testnet';

export interface BridgeQuote {
  sourceChainId: number;
  destinationChainId: number;
  amountIn: bigint;
  amountOut: bigint;
  estimatedTimeSeconds: number;
  fee: bigint;
  feeUsd: string;
  source: 'APP_KIT';
}

export interface BridgeStatus {
  status: 'pending' | 'attesting' | 'minting' | 'complete' | 'failed';
  sourceTxHash?: string;
  destinationTxHash?: string;
  message?: string;
}

export interface AppKitSwapQuote {
  estimate: SwapEstimate;
  expectedOut: string;
  minOut: string;
  fee: string;
}

export interface AppKitSwapExecution {
  txHash: string;
  amountOut?: string;
  result: SwapResult;
}

export interface UnifiedBalanceChainAmount {
  chain: string;
  confirmedBalance: string;
  pendingBalance?: string;
}

let appKit: AppKit | null = null;
const bridgeStatusCache = new Map<string, BridgeStatus>();
const appKitSupportedChains = [ArcTestnet, BaseSepolia, EthereumSepolia, ArbitrumSepolia, PolygonAmoy];

class ReactNativePrivateKeyViemAdapter extends ViemAdapter<any> {
  async switchToChain(chain: any): Promise<void> {
    if (chain.type !== 'evm') {
      throw new Error(`ViemAdapter can only switch to EVM chains. Received: ${String(chain.type)} (${chain.name})`);
    }

    // React Native exposes a window-like global, but this private-key wallet is
    // not an injected browser wallet. Re-initialize the chain-specific client
    // instead of calling wallet_switchEthereumChain on the Arc RPC endpoint.
    await this.initializeWalletClient(chain);
  }
}

function rpcForViemChain(chain: Chain) {
  if (chain.id === arcTestnet.id) {
    return process.env.EXPO_PUBLIC_ARC_RPC_URL ?? ARC_TESTNET_DEFAULTS.RPC_URL;
  }

  return chain.rpcUrls?.default?.http?.[0] ?? chain.rpcUrls?.public?.http?.[0] ?? ARC_TESTNET_DEFAULTS.RPC_URL;
}

export function getAppKitKey() {
  return (
    process.env.EXPO_PUBLIC_CIRCLE_APP_KIT_KEY?.trim() ||
    process.env.EXPO_PUBLIC_APP_KIT_PROJECT_ID?.trim()
  );
}

export function isArcAppKitConfigured() {
  const key = getAppKitKey();
  return Boolean(
    key &&
      key !== 'your_circle_app_kit_key_here' &&
      key !== 'your_app_kit_project_id_here'
  );
}

export function getAppKit() {
  if (!appKit) {
    appKit = new AppKit();
  }
  return appKit;
}

export function createArcAppKitAdapter(privateKey: string) {
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));

  return new ReactNativePrivateKeyViemAdapter(
    {
      getPublicClient: ({ chain }) =>
        createPublicClient({
          chain,
          transport: http(rpcForViemChain(chain), {
            timeout: 10_000,
            retryCount: 2,
            retryDelay: 1_000,
          }),
        }),
      getWalletClient: ({ chain }) =>
        createWalletClient({
          account,
          chain,
          transport: http(rpcForViemChain(chain), {
            timeout: 15_000,
            retryCount: 2,
            retryDelay: 1_000,
          }),
        }),
    },
    {
      addressContext: 'user-controlled',
      supportedChains: appKitSupportedChains,
    },
  );
}

export function appKitChainNameForChainId(chainId: number): AppKitChainName {
  switch (chainId) {
    case arcTestnet.id:
      return 'Arc_Testnet';
    case 84532:
      return 'Base_Sepolia';
    case 11155111:
      return 'Ethereum_Sepolia';
    case 421614:
      return 'Arbitrum_Sepolia';
    case 80002:
      return 'Polygon_Amoy_Testnet';
    default:
      throw new Error(`Unsupported App Kit chain id: ${chainId}`);
  }
}

export function chainIdForAppKitChainName(chain: string): number | null {
  switch (chain) {
    case 'Arc_Testnet':
      return arcTestnet.id;
    case 'Base_Sepolia':
      return 84532;
    case 'Ethereum_Sepolia':
      return 11155111;
    case 'Arbitrum_Sepolia':
      return 421614;
    case 'Polygon_Amoy_Testnet':
      return 80002;
    default:
      return null;
  }
}

export function isArcAppKitSwapAvailable(fromSymbol: FxTokenSymbol, toSymbol: FxTokenSymbol) {
  if (!isArcAppKitConfigured()) return false;
  if (fromSymbol === toSymbol) return false;

  // Arc App Kit supported-blockchains docs: Arc Testnet Swap supports USDC, EURC, and cirBTC.
  const supported = new Set<FxTokenSymbol>(['USDC', 'EURC', 'cirBTC']);
  return supported.has(fromSymbol) && supported.has(toSymbol);
}

function requireAppKitKey() {
  const key = getAppKitKey();
  if (!key || key === 'your_circle_app_kit_key_here') {
    throw new Error('Circle App Kit key is missing. Set EXPO_PUBLIC_CIRCLE_APP_KIT_KEY in .env and restart Expo.');
  }
  return key;
}

export async function sendUsdcWithAppKit(privateKey: string, toAddress: string, amountUsdc: string): Promise<string> {
  const kit = getAppKit();
  const adapter = createArcAppKitAdapter(privateKey);

  const step = await kit.send({
    from: { adapter, chain: 'Arc_Testnet' },
    to: toAddress,
    amount: amountUsdc,
    token: 'USDC',
  });

  const txHash = extractTxHashFromStep(step);
  if (!txHash) {
    throw new Error('App Kit send completed without a transaction hash.');
  }
  return txHash;
}

export interface GenericBridgeQuoteInput {
  sourceChainId: number;
  destinationChainId: number;
  amountUsdc: bigint;
  privateKey?: string;
  destinationAddress?: string;
}

export interface GenericBridgeExecutionInput extends Omit<GenericBridgeQuoteInput, 'privateKey'> {
  privateKey: string;
  destinationAddress: string;
}

export async function getUsdcBridgeQuote(input: GenericBridgeQuoteInput): Promise<BridgeQuote> {
  if (input.amountUsdc <= 0n) {
    throw new Error('Amount must be greater than 0.');
  }

  if (input.sourceChainId === input.destinationChainId) {
    throw new Error('Source and destination chains must be different.');
  }

  if (!input.privateKey) {
    throw new Error('Wallet not found. App Kit bridge quotes require a real wallet signer.');
  }

  try {
    const kit = getAppKit();
    const adapter = createArcAppKitAdapter(input.privateKey);
    const sourceChain = appKitChainNameForChainId(input.sourceChainId);
    const destinationChain = appKitChainNameForChainId(input.destinationChainId);
    const amount = formatUnits(input.amountUsdc, 6);

    const estimate = await kit.estimateBridge({
      from: { adapter, chain: sourceChain },
      to: { adapter, chain: destinationChain, recipientAddress: input.destinationAddress },
      amount,
      token: 'USDC',
    });

    const feeUsd = sumAppKitFees([...(estimate.fees ?? []), ...((estimate as any).gasFees ?? [])]);
    const feeRaw = parseUnits(feeUsd, 6);

    return {
      sourceChainId: input.sourceChainId,
      destinationChainId: input.destinationChainId,
      amountIn: input.amountUsdc,
      amountOut: input.amountUsdc > feeRaw ? input.amountUsdc - feeRaw : input.amountUsdc,
      estimatedTimeSeconds: estimatedBridgeSeconds(input.destinationChainId),
      fee: feeRaw,
      feeUsd,
      source: 'APP_KIT',
    };
  } catch (error) {
    console.warn('[arcAppKit] bridge estimate failed:', compactError(error));
    throw new Error(`Live App Kit bridge quote unavailable: ${compactError(error)}`);
  }
}

export async function getBridgeQuote(
  destinationChainId: number,
  amountUsdc: bigint,
  privateKey?: string,
  destinationAddress?: string,
): Promise<BridgeQuote> {
  return getUsdcBridgeQuote({
    sourceChainId: arcTestnet.id,
    destinationChainId,
    amountUsdc,
    privateKey,
    destinationAddress,
  });
}

export async function bridgeUsdcWithAppKit(input: GenericBridgeExecutionInput): Promise<string> {
  if (input.amountUsdc <= 0n) {
    throw new Error('Amount must be greater than 0.');
  }

  if (input.sourceChainId === input.destinationChainId) {
    throw new Error('Source and destination chains must be different.');
  }

  const kit = getAppKit();
  const adapter = createArcAppKitAdapter(input.privateKey);
  const sourceChain = appKitChainNameForChainId(input.sourceChainId);
  const destinationChain = appKitChainNameForChainId(input.destinationChainId);
  const amount = formatUnits(input.amountUsdc, 6);

  const result = await kit.bridge({
    from: { adapter, chain: sourceChain },
    to: { adapter, chain: destinationChain, recipientAddress: input.destinationAddress },
    amount,
    token: 'USDC',
  });

  const sourceTxHash = extractBridgeSourceTxHash(result);
  const destinationTxHash = extractBridgeDestinationTxHash(result);

  if (!sourceTxHash) {
    const failedStep = result.steps.find((step) => step.state === 'error');
    throw new Error(failedStep?.errorMessage ?? 'App Kit bridge did not return a source transaction hash.');
  }

  bridgeStatusCache.set(sourceTxHash, {
    status: result.state === 'success' ? 'complete' : result.state === 'error' ? 'failed' : 'pending',
    sourceTxHash,
    destinationTxHash,
    message: result.state,
  });

  if (result.state === 'error') {
    const failedStep = result.steps.find((step) => step.state === 'error');
    throw new Error(failedStep?.errorMessage ?? 'App Kit bridge failed.');
  }

  return sourceTxHash;
}

export async function initiateBridge(
  privateKey: string,
  destinationChainId: number,
  destinationAddress: string,
  amountUsdc: bigint,
): Promise<string> {
  return bridgeUsdcWithAppKit({
    privateKey,
    sourceChainId: arcTestnet.id,
    destinationChainId,
    destinationAddress,
    amountUsdc,
  });
}

export async function spendUnifiedUsdcWithAppKit(input: {
  privateKey: string;
  amountUsdc: string;
  recipientAddress: string;
  destinationChainId?: number;
}): Promise<string> {
  // Arc docs used: https://docs.arc.io/app-kit/unified-balance
  // Unified Balance spend lets USDC deposited across supported chains be spent on Arc.
  const kit = getAppKit();
  const adapter = createArcAppKitAdapter(input.privateKey);
  const destinationChain = appKitChainNameForChainId(input.destinationChainId ?? arcTestnet.id);
  const result = await (kit.unifiedBalance as any).spend({
    amount: input.amountUsdc,
    from: { adapter },
    to: {
      adapter,
      chain: destinationChain,
      recipientAddress: input.recipientAddress,
    },
  });

  const txHash = extractUnifiedBalanceTxHash(result);
  if (!txHash) {
    throw new Error('Unified Balance spend completed without a transaction hash.');
  }
  return txHash;
}

export async function getBridgeStatus(sourceTxHash: string): Promise<BridgeStatus> {
  return (
    bridgeStatusCache.get(sourceTxHash) ?? {
      status: 'pending',
      sourceTxHash,
      message: 'Bridge submitted. Re-open transaction details in ArcScan/App Kit history for live status.',
    }
  );
}

export async function estimateArcStableSwapWithAppKit(input: {
  privateKey: string;
  fromSymbol: FxTokenSymbol;
  toSymbol: FxTokenSymbol;
  amount: string;
  slippageBps: number;
}): Promise<AppKitSwapQuote> {
  if (!isArcAppKitSwapAvailable(input.fromSymbol, input.toSymbol)) {
    throw new Error(`App Kit swap route ${input.fromSymbol} -> ${input.toSymbol} is not configured.`);
  }

  const kit = getAppKit();
  const adapter = createArcAppKitAdapter(input.privateKey);
  const estimate = await kit.estimateSwap({
    from: { adapter, chain: 'Arc_Testnet' },
    tokenIn: input.fromSymbol,
    tokenOut: input.toSymbol,
    amountIn: input.amount,
    config: {
      kitKey: requireAppKitKey(),
      slippageBps: input.slippageBps,
    },
  });

  return {
    estimate,
    expectedOut: estimate.estimatedOutput.amount,
    minOut: estimate.stopLimit.amount,
    fee: sumAppKitFees(estimate.fees),
  };
}

export async function executeArcStableSwapWithAppKit(input: {
  privateKey: string;
  fromSymbol: FxTokenSymbol;
  toSymbol: FxTokenSymbol;
  amount: string;
  slippageBps: number;
}): Promise<AppKitSwapExecution> {
  if (!isArcAppKitSwapAvailable(input.fromSymbol, input.toSymbol)) {
    throw new Error(`App Kit swap route ${input.fromSymbol} -> ${input.toSymbol} is not configured.`);
  }

  const kit = getAppKit();
  const adapter = createArcAppKitAdapter(input.privateKey);
  const result = await kit.swap({
    from: { adapter, chain: 'Arc_Testnet' },
    tokenIn: input.fromSymbol,
    tokenOut: input.toSymbol,
    amountIn: input.amount,
    config: {
      kitKey: requireAppKitKey(),
      slippageBps: input.slippageBps,
    },
  });

  if (!result.txHash) {
    throw new Error('App Kit swap completed without a transaction hash.');
  }

  return {
    txHash: result.txHash,
    amountOut: result.amountOut,
    result,
  };
}

export async function fetchUnifiedUsdcBalances(input: {
  address?: string;
  privateKey?: string;
  chains?: AppKitChainName[];
}): Promise<{
  totalConfirmedBalance: string;
  totalPendingBalance?: string;
  chains: UnifiedBalanceChainAmount[];
  raw: GetBalancesResult;
}> {
  const kit = getAppKit();
  const chains = input.chains ?? ['Base_Sepolia', 'Ethereum_Sepolia', 'Arbitrum_Sepolia', 'Polygon_Amoy_Testnet'];
  const source = input.privateKey
    ? { adapter: createArcAppKitAdapter(input.privateKey), chains }
    : { address: input.address, chains };

  if (!input.privateKey && !input.address) {
    throw new Error('Address or private key is required for unified balance.');
  }

  const raw = await kit.unifiedBalance.getBalances({
    token: 'USDC',
    sources: source,
    includePending: true,
    networkType: 'testnet',
  });

  const chainRows = raw.breakdown.flatMap((account) =>
    account.breakdown.map((item) => ({
      chain: String(item.chain),
      confirmedBalance: item.confirmedBalance,
      pendingBalance: item.pendingBalance,
    })),
  );

  return {
    totalConfirmedBalance: raw.totalConfirmedBalance,
    totalPendingBalance: raw.totalPendingBalance,
    chains: chainRows,
    raw,
  };
}

export async function requestPaymasterSponsorship(userOpHash: string): Promise<{ paymasterData: string } | null> {
  try {
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_CIRCLE_PAYMASTER_URL ?? 'https://paymaster.arc.network/v1/sponsor'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAppKitKey() ?? ''}`,
        },
        body: JSON.stringify({ userOpHash }),
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractUnifiedBalanceTxHash(result: any): string | undefined {
  if (!result) return undefined;
  return (
    result.txHash ??
    result.transactionHash ??
    result.hash ??
    result.steps?.find((step: any) => step?.txHash)?.txHash ??
    result.transactions?.find((tx: any) => tx?.txHash || tx?.hash)?.txHash ??
    result.transactions?.find((tx: any) => tx?.txHash || tx?.hash)?.hash
  );
}
function normalizePrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
}

function estimatedBridgeSeconds(destinationChainId: number) {
  switch (destinationChainId) {
    case 84532:
      return 25;
    case 11155111:
      return 40;
    case 421614:
      return 30;
    case 80002:
      return 35;
    default:
      return 30;
  }
}

function sumAppKitFees(fees: ReadonlyArray<{ amount: string | null }> | undefined) {
  const total = (fees ?? []).reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0);
  return total.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function extractTxHashFromStep(step: BridgeStep | undefined) {
  return step?.txHash;
}

function extractBridgeSourceTxHash(result: BridgeResult) {
  return (
    findStepTxHash(result.steps, ['burn', 'source', 'deposit', 'send']) ??
    result.steps.find((step) => step.txHash)?.txHash
  );
}

function extractBridgeDestinationTxHash(result: BridgeResult) {
  return findStepTxHash(result.steps, ['mint', 'destination', 'receive']);
}

function findStepTxHash(steps: BridgeStep[], names: string[]) {
  return steps.find((step) => {
    const name = step.name.toLowerCase();
    return step.txHash && names.some((candidate) => name.includes(candidate));
  })?.txHash;
}

function compactError(error: unknown) {
  const raw = (error as any)?.shortMessage ?? (error as any)?.message ?? String(error ?? 'Unknown error');
  return raw.split('\n')[0];
}

export { BRIDGE_CHAINS };
export type { BridgeChain };






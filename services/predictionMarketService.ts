import { formatUnits, type Hex } from 'viem';
import { ARC_CONTRACTS, TOKEN_ADDRESSES } from '@/constants/chains';
import { createArcWalletClient, ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { loadPrivateKey } from '@/lib/wallet';
import { formatUsdc, parseUsdc } from '@/utils/format';

export type MarketStatus = 'open' | 'resolved' | 'cancelled' | 'unknown';
export type MarketOutcome = 'yes' | 'no';

export interface TPayMarket {
  id: string;
  creator: `0x${string}`;
  question: string;
  category: string;
  metadataURI: string;
  createdAt: number;
  closeTime: number;
  status: MarketStatus;
  winningOutcome?: MarketOutcome;
  totalYesRaw: bigint;
  totalNoRaw: bigint;
  totalYes: string;
  totalNo: string;
  totalPool: string;
  yesOdds: number;
  noOdds: number;
  feeBps: number;
  participantCount?: number;
  userYes?: string;
  userNo?: string;
  userClaimable?: string;
  userClaimed?: boolean;
}

export interface CreateMarketInput {
  question: string;
  category: string;
  closeTime: number;
  metadataURI?: string;
}

const PREDICTION_MARKET_ABI = [
  {
    name: 'marketCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'question', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'metadataURI', type: 'string' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'closeTime', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'winningOutcome', type: 'uint8' },
          { name: 'totalYes', type: 'uint256' },
          { name: 'totalNo', type: 'uint256' },
          { name: 'feeBps', type: 'uint256' },
          { name: 'feeCollected', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getPosition',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'yesAmount', type: 'uint256' },
          { name: 'noAmount', type: 'uint256' },
          { name: 'claimed', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'previewClaim',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: 'payout', type: 'uint256' }],
  },
  {
    name: 'getParticipants',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'createMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'question', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'closeTime', type: 'uint64' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: 'marketId', type: 'uint256' }],
  },
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'resolveMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'winningOutcome', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'cancelMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ name: 'payout', type: 'uint256' }],
  },
] as const;

function contractAddress() {
  return ARC_CONTRACTS.PREDICTION_MARKETS;
}

function ensureContractAddress() {
  const address = contractAddress();
  if (!address) {
    throw new Error('Community Picks contract is not configured. Deploy it and set EXPO_PUBLIC_MARKETS_ADDRESS.');
  }
  return address;
}

function statusFromCode(status: number): MarketStatus {
  if (status === 1) return 'open';
  if (status === 2) return 'resolved';
  if (status === 3) return 'cancelled';
  return 'unknown';
}

function outcomeToCode(outcome: MarketOutcome) {
  return outcome === 'yes' ? 1 : 2;
}

function outcomeFromCode(outcome: number): MarketOutcome | undefined {
  if (outcome === 1) return 'yes';
  if (outcome === 2) return 'no';
  return undefined;
}

function toNumberUsdc(raw: bigint) {
  return Number(formatUnits(raw, 6));
}

function buildMarket(id: string, raw: any, position?: any, claimableRaw?: bigint, participantCount?: number): TPayMarket {
  const totalYesRaw = BigInt(raw.totalYes ?? raw[9] ?? 0n);
  const totalNoRaw = BigInt(raw.totalNo ?? raw[10] ?? 0n);
  const total = toNumberUsdc(totalYesRaw + totalNoRaw);
  const yesAmount = toNumberUsdc(totalYesRaw);
  const noAmount = toNumberUsdc(totalNoRaw);

  return {
    id,
    creator: (raw.creator ?? raw[0]) as `0x${string}`,
    question: String(raw.question ?? raw[2] ?? ''),
    category: String(raw.category ?? raw[3] ?? 'General'),
    metadataURI: String(raw.metadataURI ?? raw[4] ?? ''),
    createdAt: Number(raw.createdAt ?? raw[5] ?? 0) * 1000,
    closeTime: Number(raw.closeTime ?? raw[6] ?? 0) * 1000,
    status: statusFromCode(Number(raw.status ?? raw[7] ?? 0)),
    winningOutcome: outcomeFromCode(Number(raw.winningOutcome ?? raw[8] ?? 0)),
    totalYesRaw,
    totalNoRaw,
    totalYes: formatUsdc(totalYesRaw),
    totalNo: formatUsdc(totalNoRaw),
    totalPool: formatUsdc(totalYesRaw + totalNoRaw),
    yesOdds: total > 0 ? yesAmount / total : 0.5,
    noOdds: total > 0 ? noAmount / total : 0.5,
    feeBps: Number(raw.feeBps ?? raw[11] ?? 0),
    participantCount,
    userYes: position ? formatUsdc(BigInt(position.yesAmount ?? position[0] ?? 0n)) : undefined,
    userNo: position ? formatUsdc(BigInt(position.noAmount ?? position[1] ?? 0n)) : undefined,
    userClaimable: claimableRaw !== undefined ? formatUsdc(claimableRaw) : undefined,
    userClaimed: position ? Boolean(position.claimed ?? position[2]) : undefined,
  };
}

export function isPredictionMarketsEnabled() {
  return Boolean(contractAddress());
}

export function getPredictionMarketsContractAddress() {
  return contractAddress();
}

export async function getPredictionMarketOwner(): Promise<`0x${string}` | null> {
  const address = contractAddress();
  if (!address) return null;
  return getPublicClient().readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'owner' }) as Promise<`0x${string}`>;
}

export async function loadPredictionMarkets(userAddress?: string | null, limit = 25): Promise<TPayMarket[]> {
  const address = contractAddress();
  if (!address) return [];

  const client = getPublicClient();
  const count = Number(await client.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'marketCount' }));
  const ids = Array.from({ length: Math.min(count, limit) }, (_, index) => String(count - index));

  const markets = await Promise.all(ids.map((id) => loadPredictionMarket(id, userAddress)));
  return markets.filter((market): market is TPayMarket => Boolean(market));
}

export async function loadPredictionMarket(id: string, userAddress?: string | null): Promise<TPayMarket | null> {
  const address = contractAddress();
  if (!address || !id) return null;

  const client = getPublicClient();
  const marketId = BigInt(id);
  const raw = await client.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'getMarket', args: [marketId] });

  let position: any | undefined;
  let claimableRaw: bigint | undefined;
  if (userAddress) {
    position = await client.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'getPosition', args: [marketId, userAddress as `0x${string}`] });
    claimableRaw = await client.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'previewClaim', args: [marketId, userAddress as `0x${string}`] }) as bigint;
  }

  let participantCount: number | undefined;
  try {
    const participants = await client.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'getParticipants', args: [marketId] }) as `0x${string}`[];
    participantCount = participants.length;
  } catch {
    participantCount = undefined;
  }

  return buildMarket(id, raw, position, claimableRaw, participantCount);
}

export async function createPredictionMarket(input: CreateMarketInput): Promise<{ txHash: string; marketId: string }> {
  const address = ensureContractAddress();
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');

  const question = input.question.trim();
  if (!question) throw new Error('Pick question is required.');
  if (input.closeTime <= Date.now() + 60_000) throw new Error('Close time must be at least 1 minute in the future.');

  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const publicClient = getPublicClient();

  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'createMarket',
    args: [question, input.category.trim() || 'General', BigInt(Math.floor(input.closeTime / 1000)), input.metadataURI ?? ''],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
  const count = await publicClient.readContract({ address, abi: PREDICTION_MARKET_ABI, functionName: 'marketCount' }) as bigint;
  return { txHash, marketId: count.toString() };
}

export async function placePredictionBet(input: { marketId: string; outcome: MarketOutcome; amount: string }): Promise<string> {
  const address = ensureContractAddress();
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');
  if (!input.amount || Number(input.amount) <= 0) throw new Error('Enter a valid USDC amount.');

  const amountRaw = parseUsdc(input.amount);
  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const publicClient = getPublicClient();
  const tokenAddress = TOKEN_ADDRESSES.ARC_USDC;

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, address],
  }) as bigint;

  if (allowance < amountRaw) {
    const approvalHash = await walletClient.writeContract({
      account,
      chain: null,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [address, amountRaw],
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalHash, confirmations: 1 });
  }

  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'placeBet',
    args: [BigInt(input.marketId), outcomeToCode(input.outcome), amountRaw],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
  return txHash;
}

export async function resolvePredictionMarket(marketId: string, outcome: MarketOutcome): Promise<string> {
  const address = ensureContractAddress();
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');

  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'resolveMarket',
    args: [BigInt(marketId), outcomeToCode(outcome)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
  return txHash;
}

export async function claimPredictionMarket(marketId: string): Promise<string> {
  const address = ensureContractAddress();
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');

  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'claim',
    args: [BigInt(marketId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
  return txHash;
}

export async function cancelPredictionMarket(marketId: string): Promise<string> {
  const address = ensureContractAddress();
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found. Create or import a wallet first.');

  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'cancelMarket',
    args: [BigInt(marketId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
  return txHash;
}
export function estimateYesNoPrice(market: TPayMarket) {
  const yes = Math.round(market.yesOdds * 100);
  const no = Math.round(market.noOdds * 100);
  return { yes, no };
}




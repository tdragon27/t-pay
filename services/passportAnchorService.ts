import { encodePacked, keccak256, type Hex } from 'viem';
import { CONTRACT_ADDRESSES, PASSPORT_ANCHOR_ABI, isPassportAnchorConfigured } from '@/constants/contracts';
import { createArcWalletClient, getPublicClient } from '@/lib/viemClient';
import { loadPrivateKey } from '@/lib/wallet';
import { ensureCriticalAuth } from '@/services/securityService';

export interface PassportAnchorView {
  contentHash: Hex;
  level: number;
  timestamp: number;
}

export function buildAchievementHash(address: `0x${string}`, level: number, label: string, timestamp = Date.now()) {
  return keccak256(encodePacked(['address', 'uint32', 'string', 'uint256'], [address, level, label, BigInt(timestamp)]));
}

export async function readPassportAnchor(address: `0x${string}`): Promise<PassportAnchorView | null> {
  if (!isPassportAnchorConfigured()) return null;
  const contractAddress = CONTRACT_ADDRESSES.PASSPORT_ANCHOR as `0x${string}`;
  const result = await getPublicClient().readContract({
    address: contractAddress,
    abi: PASSPORT_ANCHOR_ABI,
    functionName: 'getAnchor',
    args: [address],
  }) as readonly [Hex, number, bigint];
  return { contentHash: result[0], level: Number(result[1]), timestamp: Number(result[2]) };
}

export async function anchorPassportAchievement(level: number, label: string) {
  if (!isPassportAnchorConfigured()) throw new Error('Passport anchor contract is not configured.');
  const contractAddress = CONTRACT_ADDRESSES.PASSPORT_ANCHOR as `0x${string}`;
  const unlocked = await ensureCriticalAuth();
  if (!unlocked) throw new Error('PIN or biometric unlock is required before anchoring a passport badge.');
  const pk = await loadPrivateKey();
  if (!pk) throw new Error('Wallet not found.');
  const walletClient = createArcWalletClient(pk as Hex);
  const account = walletClient.account!;
  const contentHash = buildAchievementHash(account.address, level, label);
  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address: contractAddress,
    abi: PASSPORT_ANCHOR_ABI,
    functionName: 'anchorAchievement',
    args: [contentHash, level],
  });
  return { txHash, contentHash };
}

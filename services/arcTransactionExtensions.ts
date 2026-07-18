import {
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseEventLogs,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';

import { ARC_OFFICIAL_CONTRACTS } from '@/constants/chains';
import { getArcTestnetToken, type SupportedArcTokenSymbol } from '@/constants/tokens';
import { createArcWalletClient, ERC20_ABI, getPublicClient } from '@/lib/viemClient';
import { waitForSuccessfulReceipt } from '@/lib/transactionReceipt';
import { loadPrivateKey } from '@/lib/wallet';
import { ensureCriticalAuth } from '@/services/securityService';
import { formatTokenAmount } from '@/utils/format';

// Arc docs:
// https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo
// https://docs.arc.io/arc/tutorials/batch-usdc-transfers
// Both predeploys preserve the original EOA sender through Arc's CallFrom path.

export const ARC_MEMO_ABI = [
  {
    type: 'function',
    name: 'memo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'memoId', type: 'bytes32' },
      { name: 'memoData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'BeforeMemo',
    anonymous: false,
    inputs: [{ name: 'memoIndex', type: 'uint256', indexed: true }],
  },
  {
    type: 'event',
    name: 'Memo',
    anonymous: false,
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'callDataHash', type: 'bytes32', indexed: false },
      { name: 'memoId', type: 'bytes32', indexed: true },
      { name: 'memo', type: 'bytes', indexed: false },
      { name: 'memoIndex', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ARC_MULTICALL3_FROM_ABI = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

export interface ArcSubmittedTransaction {
  txHash: Hex;
  receipt: TransactionReceipt;
  verified: true;
}

type SubmittedCallback = (hash: Hex) => void | Promise<void>;

function requireByteLength(value: string, maxBytes: number, label: string) {
  const encoded = stringToHex(value);
  const bytes = (encoded.length - 2) / 2;
  if (bytes > maxBytes) throw new Error(`${label} must be ${maxBytes} bytes or less.`);
  return encoded;
}

async function requireWallet() {
  const unlocked = await ensureCriticalAuth();
  if (!unlocked) throw new Error('Unlock T Pay before continuing.');
  const privateKey = await loadPrivateKey();
  if (!privateKey) throw new Error('Wallet not found. Create or import a wallet first.');
  const walletClient = createArcWalletClient(privateKey);
  const account = walletClient.account;
  if (!account) throw new Error('Wallet account is unavailable.');
  return { walletClient, account };
}

function verifyTransferEvent(input: {
  receipt: TransactionReceipt;
  tokenAddress: Address;
  sender: Address;
  recipient: Address;
  amount: bigint;
}) {
  const logs = input.receipt.logs.filter(
    (log) => log.address.toLowerCase() === input.tokenAddress.toLowerCase(),
  );
  const transfers = parseEventLogs({
    abi: ERC20_ABI,
    eventName: 'Transfer',
    logs,
    strict: true,
  });
  return transfers.some((event) => {
    const args = event.args as { from: Address; to: Address; value: bigint };
    return (
      args.from.toLowerCase() === input.sender.toLowerCase() &&
      args.to.toLowerCase() === input.recipient.toLowerCase() &&
      args.value === input.amount
    );
  });
}

export async function submitArcMemoTransfer(input: {
  recipient: string;
  amount: string;
  tokenSymbol: SupportedArcTokenSymbol;
  reference: string;
  publicMemo: string;
  onSubmitted?: SubmittedCallback;
}): Promise<ArcSubmittedTransaction & { memoId: Hex; memoIndex: bigint }> {
  if (!isAddress(input.recipient)) throw new Error('Enter a valid recipient address.');
  const reference = input.reference.trim();
  const publicMemo = input.publicMemo.trim();
  if (!reference) throw new Error('A payment reference is required for an onchain memo.');

  const referenceBytes = requireByteLength(reference, 96, 'Payment reference');
  const memoBytes = requireByteLength(publicMemo || reference, 240, 'Public memo');
  const memoId = keccak256(referenceBytes);
  const token = getArcTestnetToken(input.tokenSymbol);
  const amountRaw = parseUnits(input.amount.trim().replace(',', '.'), token.decimals);
  if (amountRaw <= 0n) throw new Error('Amount must be greater than zero.');

  const { walletClient, account } = await requireWallet();
  const publicClient = getPublicClient();
  const recipient = getAddress(input.recipient);
  const memoAddress = getAddress(ARC_OFFICIAL_CONTRACTS.MEMO);
  const tokenAddress = getAddress(token.contractAddress);

  const [memoCode, balance] = await Promise.all([
    publicClient.getCode({ address: memoAddress }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }) as Promise<bigint>,
  ]);
  if (!memoCode || memoCode === '0x') throw new Error('Arc Memo contract is unavailable on this RPC.');
  if (amountRaw > balance) {
    throw new Error(`Insufficient ${token.symbol} balance. Available: ${formatTokenAmount(balance, token.decimals, token.displayDecimals)}.`);
  }

  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amountRaw],
  });
  const callDataHash = keccak256(transferData);

  await publicClient.simulateContract({
    account: account.address,
    address: memoAddress,
    abi: ARC_MEMO_ABI,
    functionName: 'memo',
    args: [tokenAddress, transferData, memoId, memoBytes],
  });

  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address: memoAddress,
    abi: ARC_MEMO_ABI,
    functionName: 'memo',
    args: [tokenAddress, transferData, memoId, memoBytes],
  });
  await input.onSubmitted?.(txHash);
  const receipt = await waitForSuccessfulReceipt(publicClient, txHash);

  const memoContractLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === memoAddress.toLowerCase(),
  );
  const beforeEvents = parseEventLogs({
    abi: ARC_MEMO_ABI,
    eventName: 'BeforeMemo',
    logs: memoContractLogs,
    strict: true,
  });
  const memoEvents = parseEventLogs({
    abi: ARC_MEMO_ABI,
    eventName: 'Memo',
    logs: memoContractLogs,
    strict: true,
  });
  if (beforeEvents.length !== 1 || memoEvents.length !== 1) {
    throw new Error('Arc Memo event verification failed.');
  }
  const memoArgs = memoEvents[0].args as {
    sender: Address;
    target: Address;
    callDataHash: Hex;
    memoId: Hex;
    memo: Hex;
    memoIndex: bigint;
  };
  const memoVerified =
    memoArgs.sender.toLowerCase() === account.address.toLowerCase() &&
    memoArgs.target.toLowerCase() === tokenAddress.toLowerCase() &&
    memoArgs.callDataHash === callDataHash &&
    memoArgs.memoId === memoId &&
    memoArgs.memo === memoBytes;
  const transferVerified = verifyTransferEvent({
    receipt,
    tokenAddress,
    sender: account.address,
    recipient,
    amount: amountRaw,
  });
  if (!memoVerified || !transferVerified) {
    throw new Error('The transaction confirmed, but its memo or transfer event did not match the reviewed payment.');
  }

  return { txHash, receipt, verified: true, memoId, memoIndex: memoArgs.memoIndex };
}

export interface BatchUsdcRecipient {
  address: string;
  amount: string;
  label?: string;
}

export async function submitArcBatchUsdc(input: {
  recipients: BatchUsdcRecipient[];
  onSubmitted?: SubmittedCallback;
}): Promise<ArcSubmittedTransaction & { totalRaw: bigint; recipientCount: number }> {
  if (input.recipients.length < 2 || input.recipients.length > 20) {
    throw new Error('Batch payouts require 2 to 20 recipients.');
  }
  const seen = new Set<string>();
  const recipients = input.recipients.map((row) => {
    if (!isAddress(row.address)) throw new Error('Check every recipient address.');
    const address = getAddress(row.address);
    const key = address.toLowerCase();
    if (seen.has(key)) throw new Error('Each batch recipient must be unique.');
    seen.add(key);
    const amountRaw = parseUnits(row.amount.trim().replace(',', '.'), 6);
    if (amountRaw <= 0n) throw new Error('Every payout amount must be greater than zero.');
    return { ...row, address, amountRaw };
  });
  const totalRaw = recipients.reduce((total, row) => total + row.amountRaw, 0n);

  const { walletClient, account } = await requireWallet();
  const publicClient = getPublicClient();
  const usdcAddress = getAddress(ARC_OFFICIAL_CONTRACTS.USDC_ERC20);
  const multicallAddress = getAddress(ARC_OFFICIAL_CONTRACTS.MULTICALL3_FROM);
  const [code, balance] = await Promise.all([
    publicClient.getCode({ address: multicallAddress }),
    publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }) as Promise<bigint>,
  ]);
  if (!code || code === '0x') throw new Error('Arc batch contract is unavailable on this RPC.');
  if (totalRaw > balance) {
    throw new Error(`Insufficient USDC balance. Available: ${formatTokenAmount(balance, 6, 2)} USDC.`);
  }

  const calls = recipients.map((row) => ({
    target: usdcAddress,
    allowFailure: false,
    callData: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [row.address, row.amountRaw],
    }),
  }));
  const simulation = await publicClient.simulateContract({
    account: account.address,
    address: multicallAddress,
    abi: ARC_MULTICALL3_FROM_ABI,
    functionName: 'aggregate3',
    args: [calls],
  });
  const simulated = simulation.result as readonly { success: boolean; returnData: Hex }[];
  if (!simulated.every((row) => row.success)) throw new Error('At least one payout failed simulation. Nothing was sent.');

  const txHash = await walletClient.writeContract({
    account,
    chain: null,
    address: multicallAddress,
    abi: ARC_MULTICALL3_FROM_ABI,
    functionName: 'aggregate3',
    args: [calls],
  });
  await input.onSubmitted?.(txHash);
  const receipt = await waitForSuccessfulReceipt(publicClient, txHash);

  const allVerified = recipients.every((row) =>
    verifyTransferEvent({
      receipt,
      tokenAddress: usdcAddress,
      sender: account.address,
      recipient: row.address,
      amount: row.amountRaw,
    }),
  );
  if (!allVerified) {
    throw new Error('The batch confirmed, but one or more transfer events did not match the reviewed payouts.');
  }

  return {
    txHash,
    receipt,
    verified: true,
    totalRaw,
    recipientCount: recipients.length,
  };
}

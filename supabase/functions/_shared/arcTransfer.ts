export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface ArcReceiptLog {
  address?: string;
  data?: string;
  topics?: string[];
  removed?: boolean;
}

export interface ArcTransactionReceipt {
  status?: string;
  transactionHash?: string;
  blockNumber?: string;
  logs?: ArcReceiptLog[];
}

export interface VerifiedTransfer {
  amountUnits: bigint;
  payerWallet: string;
  receiverWallet: string;
  blockNumber: bigint;
}

function normalizedAddress(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function addressFromTopic(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) return null;
  return `0x${normalized.slice(-40)}`;
}

function positiveHex(value: string | undefined) {
  if (!value || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function findVerifiedTransfer(
  receipt: ArcTransactionReceipt | null,
  expectedTxHash: string,
  tokenAddress: string,
  receiverWallet: string,
): VerifiedTransfer | null {
  if (!receipt || receipt.status?.toLowerCase() !== '0x1') return null;
  if (receipt.transactionHash?.toLowerCase() !== expectedTxHash.toLowerCase()) return null;

  const expectedToken = normalizedAddress(tokenAddress);
  const expectedReceiver = normalizedAddress(receiverWallet);
  const blockNumber = positiveHex(receipt.blockNumber);
  if (!expectedToken || !expectedReceiver || !blockNumber) return null;

  let amountUnits = 0n;
  let payerWallet: string | null = null;

  for (const log of receipt.logs ?? []) {
    if (log.removed || normalizedAddress(log.address) !== expectedToken) continue;
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const payer = addressFromTopic(topics[1]);
    const receiver = addressFromTopic(topics[2]);
    const amount = positiveHex(log.data);
    if (!payer || receiver !== expectedReceiver || !amount) continue;

    amountUnits += amount;
    payerWallet ??= payer;
  }

  if (!payerWallet || amountUnits <= 0n) return null;
  return { amountUnits, payerWallet, receiverWallet: expectedReceiver, blockNumber };
}

export function formatUnitsDecimal(value: bigint, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error('Invalid token decimals.');
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

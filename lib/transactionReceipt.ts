import type { Hex, PublicClient, TransactionReceipt } from 'viem';

export function assertSuccessfulReceipt<T extends Pick<TransactionReceipt, 'status'>>(receipt: T): T {
  if (receipt.status !== 'success') {
    throw new Error('Transaction was mined but reverted on Arc Testnet.');
  }
  return receipt;
}

export async function waitForSuccessfulReceipt(
  client: PublicClient,
  hash: Hex,
  confirmations = 1,
) {
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations });
  return assertSuccessfulReceipt(receipt);
}

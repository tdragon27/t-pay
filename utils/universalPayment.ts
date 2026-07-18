import type { SupportedArcTokenSymbol } from '../constants/tokens';
import { decimalInputToBigInt } from './format';

export type UniversalPaymentRoute =
  | 'invalid'
  | 'direct'
  | 'memo'
  | 'unified_balance'
  | 'swap_first'
  | 'insufficient';

export interface UniversalPaymentPlan {
  route: UniversalPaymentRoute;
  title: string;
  detail: string;
  canSubmit: boolean;
}

export function buildUniversalPaymentPlan(input: {
  tokenSymbol: SupportedArcTokenSymbol;
  amountRaw: bigint | null;
  arcBalanceRaw: bigint;
  unifiedUsdcRaw?: bigint;
  unifiedConfigured: boolean;
  memoRequested: boolean;
  hasAlternativeArcBalance: boolean;
}): UniversalPaymentPlan {
  const required = input.amountRaw ?? 0n;
  if (required <= 0n) {
    return {
      route: 'invalid',
      title: 'Enter an amount',
      detail: 'Choose how much you want to pay.',
      canSubmit: false,
    };
  }

  if (input.arcBalanceRaw >= required) {
    return input.memoRequested
      ? {
          route: 'memo',
          title: 'Pay with onchain memo',
          detail: 'One Arc transaction with a public, verifiable payment reference.',
          canSubmit: true,
        }
      : {
          route: 'direct',
          title: 'Pay directly on Arc',
          detail: 'Your selected Arc Testnet balance covers this payment.',
          canSubmit: true,
        };
  }

  if (
    input.tokenSymbol === 'USDC' &&
    input.unifiedConfigured &&
    (input.unifiedUsdcRaw ?? 0n) >= required
  ) {
    return {
      route: 'unified_balance',
      title: 'Pay from Unified Balance',
      detail: 'Circle App Kit can source confirmed testnet USDC and settle to Arc.',
      canSubmit: true,
    };
  }

  if (input.hasAlternativeArcBalance) {
    return {
      route: 'swap_first',
      title: 'Swap before paying',
      detail: `Your ${input.tokenSymbol} balance is short, but another Arc asset is available.`,
      canSubmit: false,
    };
  }

  return {
    route: 'insufficient',
    title: 'Insufficient balance',
    detail: `Add ${input.tokenSymbol} on Arc Testnet before continuing.`,
    canSubmit: false,
  };
}

export interface BatchDraftRecipient {
  address: string;
  amount: string;
}

export function validateBatchDraft(
  recipients: BatchDraftRecipient[],
  balanceRaw: bigint,
  maxRecipients = 20,
) {
  if (recipients.length < 2) {
    return { valid: false, error: 'Add at least two recipients.', totalRaw: 0n };
  }
  if (recipients.length > maxRecipients) {
    return { valid: false, error: `A batch supports up to ${maxRecipients} recipients.`, totalRaw: 0n };
  }

  const seen = new Set<string>();
  let totalRaw = 0n;
  for (const recipient of recipients) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient.address.trim())) {
      return { valid: false, error: 'Check every recipient address.', totalRaw: 0n };
    }
    const normalized = recipient.address.trim().toLowerCase();
    if (seen.has(normalized)) {
      return { valid: false, error: 'Each recipient must be unique.', totalRaw: 0n };
    }
    seen.add(normalized);

    const amountRaw = decimalInputToBigInt(recipient.amount, 6);
    if (!amountRaw) {
      return { valid: false, error: 'Enter a valid USDC amount for every recipient.', totalRaw: 0n };
    }
    totalRaw += amountRaw;
  }

  if (totalRaw > balanceRaw) {
    return { valid: false, error: 'Insufficient USDC balance for this batch.', totalRaw };
  }

  return { valid: true, error: null, totalRaw };
}

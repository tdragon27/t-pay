import type { ChainBalance } from '@/hooks/useMultiChainBalance';

export type CrosschainPayMode = 'pay_on_arc' | 'fund_arc_first' | 'insufficient';

export interface CrosschainPayPlan {
  mode: CrosschainPayMode;
  arcAmount: number;
  externalAmount: number;
  totalAmount: number;
  requiredAmount: number;
  missingAmount: number;
  suggestedSource?: ChainBalance;
  message: string;
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildCrosschainPayPlan(input: {
  requiredAmount: string | number;
  arcBalanceFormatted: string;
  externalBalances: ChainBalance[];
}): CrosschainPayPlan {
  const requiredAmount = typeof input.requiredAmount === 'number'
    ? input.requiredAmount
    : toNumber(String(input.requiredAmount));
  const arcAmount = toNumber(input.arcBalanceFormatted);
  const availableExternal = input.externalBalances.filter((balance) => !balance.error && balance.rawBalance > 0n);
  const externalAmount = availableExternal.reduce((sum, balance) => sum + toNumber(balance.balance), 0);
  const totalAmount = arcAmount + externalAmount;
  const missingAmount = Math.max(requiredAmount - arcAmount, 0);
  const suggestedSource = availableExternal
    .filter((balance) => toNumber(balance.balance) > 0)
    .sort((left, right) => toNumber(right.balance) - toNumber(left.balance))[0];

  if (requiredAmount <= 0) {
    return {
      mode: 'insufficient',
      arcAmount,
      externalAmount,
      totalAmount,
      requiredAmount,
      missingAmount: 0,
      message: 'Invalid invoice amount.',
    };
  }

  if (arcAmount >= requiredAmount) {
    return {
      mode: 'pay_on_arc',
      arcAmount,
      externalAmount,
      totalAmount,
      requiredAmount,
      missingAmount: 0,
      message: 'Arc balance is enough. Settle this invoice directly on Arc.',
    };
  }

  if (totalAmount >= requiredAmount && suggestedSource) {
    return {
      mode: 'fund_arc_first',
      arcAmount,
      externalAmount,
      totalAmount,
      requiredAmount,
      missingAmount,
      suggestedSource,
      message: `Bridge about ${missingAmount.toFixed(2)} USDC from ${suggestedSource.chainName} to Arc before paying.`,
    };
  }

  return {
    mode: 'insufficient',
    arcAmount,
    externalAmount,
    totalAmount,
    requiredAmount,
    missingAmount,
    message: 'Not enough USDC across Arc and supported testnet chains.',
  };
}

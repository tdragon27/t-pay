import { FX_TOKENS, type FxTokenSymbol } from '@/constants/chains';
import { isValidAddress } from '@/utils/format';

export type RiskOperation = 'invoice_create' | 'invoice_pay' | 'send' | 'swap';
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface RiskControls {
  maxInvoiceUsd: number;
  maxPaymentUsd: number;
  reviewThresholdUsd: number;
  allowedTokens: FxTokenSymbol[];
  blockedAddresses: string[];
  checkedAt: number;
}

export interface RiskAssessment {
  allowed: boolean;
  level: RiskLevel;
  reasons: string[];
  warnings: string[];
  controls: RiskControls;
}

export interface RiskInput {
  operation: RiskOperation;
  amount: string | number;
  tokenSymbol: FxTokenSymbol;
  merchantAddress?: string | null;
  payerAddress?: string | null;
  recipientAddress?: string | null;
  label?: string;
}

const DEFAULT_ALLOWED_TOKENS: FxTokenSymbol[] = ['USDC', 'EURC'];

function readNumberEnv(key: string, fallback: number) {
  const raw = process.env[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readTokenListEnv(key: string): FxTokenSymbol[] {
  const raw = process.env[key];
  if (!raw) return DEFAULT_ALLOWED_TOKENS;

  const known = new Set(Object.keys(FX_TOKENS) as FxTokenSymbol[]);
  const parsed = raw
    .split(',')
    .map((item) => item.trim().toUpperCase() as FxTokenSymbol)
    .filter((item) => known.has(item));

  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_TOKENS;
}

function readAddressListEnv(key: string) {
  return (process.env[key] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function estimateUsdValue(amount: number, tokenSymbol: FxTokenSymbol) {
  if (tokenSymbol === 'EURC') return amount * 1.08;
  return amount;
}

function pushAddressCheck(reasons: string[], address: string | null | undefined, blocked: Set<string>, label: string) {
  if (!address) return;
  if (!isValidAddress(address)) {
    reasons.push(`${label} address is not a valid EVM address.`);
    return;
  }
  if (blocked.has(address.toLowerCase())) {
    reasons.push(`${label} address is blocked by local risk controls.`);
  }
}

export function getRiskControls(): RiskControls {
  return {
    maxInvoiceUsd: readNumberEnv('EXPO_PUBLIC_TPAY_MAX_INVOICE_USD', 10_000),
    maxPaymentUsd: readNumberEnv('EXPO_PUBLIC_TPAY_MAX_PAYMENT_USD', 10_000),
    reviewThresholdUsd: readNumberEnv('EXPO_PUBLIC_TPAY_REVIEW_THRESHOLD_USD', 2_500),
    allowedTokens: readTokenListEnv('EXPO_PUBLIC_TPAY_ALLOWED_TOKENS'),
    blockedAddresses: readAddressListEnv('EXPO_PUBLIC_TPAY_BLOCKED_ADDRESSES'),
    checkedAt: Date.now(),
  };
}

export function assessPaymentRisk(input: RiskInput): RiskAssessment {
  const controls = getRiskControls();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const amount = Number(String(input.amount).replace(/,/g, ''));
  const amountUsd = Number.isFinite(amount) ? estimateUsdValue(amount, input.tokenSymbol) : 0;
  const blocked = new Set(controls.blockedAddresses);

  if (!Number.isFinite(amount) || amount <= 0) {
    reasons.push('Amount must be greater than zero.');
  }

  if (!controls.allowedTokens.includes(input.tokenSymbol)) {
    reasons.push(`${input.tokenSymbol} is not in the local token allowlist.`);
  }

  if (!FX_TOKENS[input.tokenSymbol]?.address) {
    reasons.push(`${input.tokenSymbol} does not have a confirmed Arc Testnet token address configured.`);
  }

  const maxUsd = input.operation === 'invoice_create' ? controls.maxInvoiceUsd : controls.maxPaymentUsd;
  if (amountUsd > maxUsd) {
    reasons.push(`Amount exceeds the configured limit of $${maxUsd.toLocaleString('en-US')}.`);
  }

  pushAddressCheck(reasons, input.merchantAddress, blocked, 'Merchant');
  pushAddressCheck(reasons, input.payerAddress, blocked, 'Payer');
  pushAddressCheck(reasons, input.recipientAddress, blocked, 'Recipient');

  if (amountUsd >= controls.reviewThresholdUsd) {
    warnings.push(`Large payment: review manually above $${controls.reviewThresholdUsd.toLocaleString('en-US')}.`);
  }

  if (input.label && /refund|airdrop|urgent|seed|private key/i.test(input.label)) {
    warnings.push('Label contains sensitive or high-risk wording; verify the merchant context.');
  }

  if (!process.env.EXPO_PUBLIC_TPAY_BACKEND_URL && input.operation.startsWith('invoice')) {
    warnings.push('Backend indexer is not configured, so invoice sync is local-first on this device.');
  }

  const allowed = reasons.length === 0;
  const level: RiskLevel = !allowed
    ? 'blocked'
    : warnings.length > 1
      ? 'high'
      : warnings.length === 1
        ? 'medium'
        : 'low';

  return { allowed, level, reasons, warnings, controls };
}

export function assertRiskAllowed(input: RiskInput): RiskAssessment {
  const assessment = assessPaymentRisk(input);
  if (!assessment.allowed) {
    throw new Error(assessment.reasons.join(' '));
  }
  return assessment;
}

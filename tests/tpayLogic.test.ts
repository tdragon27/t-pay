import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityDedupeKey,
  applyPaymentIntentTransition,
  buildMerchantPaymentIntentId,
  calculateSplitProgress,
  canAutoExecuteWalletTask,
  canSetPaymentIntentStatus,
  dedupeByActivityKey,
  isSafeOpenUrl,
  normalizePaymentAmount,
  normalizePaymentIntentStatus,
  redactUrlForLog,
  resolveBalanceFallback,
  splitPaymentGuard,
} from '../utils/tpayLogic';
import { resolveArcTestnetRpcUrl } from '../constants/chains';
import { assertSuccessfulReceipt } from '../lib/transactionReceipt';
import { MAX_PAYMENT_REQUEST_LENGTH, parsePaymentRequest } from '../services/paymentRequestService';
import { decimalInputToBigInt, getDecimalInputError, normalizeDecimalInput, sanitizeDecimalInput } from '../utils/format';
import { buildUniversalPaymentPlan, validateBatchDraft } from '../utils/universalPayment';

test('payment intent status transitions follow the signing lifecycle', () => {
  assert.equal(
    applyPaymentIntentTransition('draft', 'request_user_confirmation'),
    'awaiting_user_confirmation',
  );
  assert.equal(applyPaymentIntentTransition('awaiting_user_confirmation', 'submit'), 'submitting');
  assert.equal(applyPaymentIntentTransition('submitting', 'submitted'), 'submitted');
  assert.equal(applyPaymentIntentTransition('submitted', 'confirm'), 'confirmed');
  assert.equal(applyPaymentIntentTransition('pending', 'fail'), 'failed');
  assert.equal(applyPaymentIntentTransition('draft', 'cancel'), 'cancelled');
  assert.throws(
    () => applyPaymentIntentTransition('confirmed', 'fail'),
    /Illegal payment intent transition/,
  );
});

test('payment intent persistence rejects status regressions and normalizes legacy values', () => {
  assert.equal(canSetPaymentIntentStatus('submitted', 'pending'), true);
  assert.equal(canSetPaymentIntentStatus('pending', 'confirmed'), true);
  assert.equal(canSetPaymentIntentStatus('confirmed', 'pending'), false);
  assert.equal(canSetPaymentIntentStatus('failed', 'submitted'), false);
  assert.equal(normalizePaymentIntentStatus('paid'), 'confirmed');
  assert.equal(normalizePaymentIntentStatus('processing'), 'pending');
  assert.equal(normalizePaymentIntentStatus('unexpected-status'), 'draft');
});

test('activity de-dupes by lowercase txHash and keeps newest strongest status', () => {
  assert.equal(activityDedupeKey('a', '0xABC'), 'tx:0xabc');
  const rows = dedupeByActivityKey([
    { id: 'pending', txHash: '0xABC', timestamp: 100, status: 'pending' },
    { id: 'confirmed', txHash: '0xabc', timestamp: 90, status: 'confirmed' },
    { id: 'nohash', timestamp: 200, status: 'pending' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.txHash)?.id, 'confirmed');
});

test('split completeByTotal completes when received reaches total', () => {
  const partial = calculateSplitProgress({
    totalUsdc: '30.00',
    receivedUsdc: '25.00',
    completeByTotal: true,
    participants: [
      { paid: true, amountUsdc: '10.00' },
      { paid: false, amountUsdc: '10.00' },
      { paid: false, amountUsdc: '10.00' },
    ],
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.percent, 83);

  const complete = calculateSplitProgress({
    totalUsdc: '30.00',
    receivedUsdc: '30.00',
    completeByTotal: true,
    participants: [],
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.percent, 100);
});

test('split participant completion requires all participants paid', () => {
  const progress = calculateSplitProgress({
    totalUsdc: '30.00',
    completeByTotal: false,
    participants: [
      { paid: true, amountUsdc: '10.00' },
      { paid: true, amountUsdc: '10.00' },
      { paid: false, amountUsdc: '10.00' },
    ],
  });
  assert.equal(progress.complete, false);
  assert.equal(progress.paid, 2);

  const done = calculateSplitProgress({
    totalUsdc: '30.00',
    completeByTotal: false,
    participants: [
      { paid: true, amountUsdc: '10.00' },
      { paid: true, amountUsdc: '10.00' },
      { paid: true, amountUsdc: '10.00' },
    ],
  });
  assert.equal(done.complete, true);
});

test('split guard blocks expired/cancelled and duplicate participant payments', () => {
  assert.equal(splitPaymentGuard({ lifecycleStatus: 'expired', completeByTotal: true }).allowed, false);
  assert.equal(splitPaymentGuard({ lifecycleStatus: 'cancelled', completeByTotal: true }).allowed, false);
  assert.equal(splitPaymentGuard({ lifecycleStatus: 'open', completeByTotal: false }).allowed, false);

  const duplicate = splitPaymentGuard({
    lifecycleStatus: 'partial',
    completeByTotal: false,
    participantId: 'p1',
    participantPaid: true,
    sameParticipantTx: true,
  });
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.duplicate, true);
});

test('merchant paymentIntentId uses invoiceId and lowercased txHash', () => {
  assert.equal(
    buildMerchantPaymentIntentId('inv_1', '0xABCDEF'),
    'merchant_payment_inv_1_0xabcdef',
  );
});

test('cached balance fallback only activates when live source is unavailable', () => {
  assert.deepEqual(
    resolveBalanceFallback({ source: 'UNAVAILABLE', liveTotalUsdc: 0, cachedTotalUsdc: '42.50' }),
    { usingCache: true, totalUsdc: 42.5 },
  );
  assert.deepEqual(
    resolveBalanceFallback({ source: 'RPC_FALLBACK', liveTotalUsdc: 12, cachedTotalUsdc: '42.50' }),
    { usingCache: false, totalUsdc: 12 },
  );
});



test('external URL policy permits supported links and rejects unsafe schemes', () => {
  assert.equal(isSafeOpenUrl('https://testnet.arcscan.app/tx/0xabc'), true);
  assert.equal(isSafeOpenUrl('tpay://pay?invoiceId=invoice-1'), true);
  assert.equal(isSafeOpenUrl('exp://192.168.1.2:8081'), true);
  assert.equal(isSafeOpenUrl('javascript:alert(1)'), false);
  assert.equal(isSafeOpenUrl('file:///private/wallet.json'), false);
  assert.equal(isSafeOpenUrl(`https://example.com/${'a'.repeat(4096)}`), false);

  const redacted = redactUrlForLog('https://example.com/pay?token=secret-value');
  assert.equal(redacted.includes('secret-value'), false);
  assert.match(redacted, /<redacted>/);
});

test('payment request parser rejects hostile schemes and oversized QR payloads', () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const request = parsePaymentRequest(`tpay://request?address=${wallet}&amount=1.25`);
  assert.equal(request.kind, 'request');

  const ethereumRequest = parsePaymentRequest(`ethereum:${wallet}?amount=1`);
  assert.equal(ethereumRequest.kind, 'send');

  const unsafeRequest = parsePaymentRequest(`javascript:${wallet}`);
  assert.equal(unsafeRequest.kind, 'unknown');
  assert.match(unsafeRequest.reason ?? '', /Unsupported payment link scheme/);

  const oversizedRequest = parsePaymentRequest('x'.repeat(MAX_PAYMENT_REQUEST_LENGTH + 1));
  assert.equal(oversizedRequest.kind, 'unknown');
  assert.match(oversizedRequest.reason ?? '', /too large/);

  assert.equal(parsePaymentRequest('{not-valid-json').kind, 'unknown');
});

test('cirBTC decimal input preserves temporary typing states', () => {
  assert.equal(sanitizeDecimalInput('0', 8), '0');
  assert.equal(sanitizeDecimalInput('0.', 8), '0.');
  assert.equal(sanitizeDecimalInput('0,', 8), '0,');
  assert.equal(sanitizeDecimalInput('0.0', 8), '0.0');
  assert.equal(sanitizeDecimalInput('0,0', 8), '0,0');
  assert.equal(sanitizeDecimalInput('0.0001', 8), '0.0001');
  assert.equal(sanitizeDecimalInput('0,0001', 8), '0,0001');
  assert.equal(sanitizeDecimalInput('0.000000001', 8), '0.00000000');
});

test('cirBTC decimal input parses only valid final amounts', () => {
  assert.equal(decimalInputToBigInt('', 8), null);
  assert.equal(decimalInputToBigInt('0', 8), null);
  assert.equal(decimalInputToBigInt('0.', 8), null);
  assert.equal(decimalInputToBigInt('0,', 8), null);
  assert.equal(decimalInputToBigInt('0.0001', 8)?.toString(), '10000');
  assert.equal(decimalInputToBigInt('0,0001', 8)?.toString(), '10000');
  assert.equal(decimalInputToBigInt('0.000127', 8)?.toString(), '12700');
  assert.equal(getDecimalInputError('0.000000001', 8), 'Too many decimal places');
});


test('decimal normalize handles iOS comma and thousands comma', () => {
  assert.equal(normalizeDecimalInput('0,000001'), '0.000001');
  assert.equal(normalizeDecimalInput('0,000127'), '0.000127');
  assert.equal(normalizeDecimalInput('58,542.133512'), '58542.133512');
  assert.equal(decimalInputToBigInt('0,000001', 8)?.toString(), '100');
});

test('receipt success is required before marking a transaction confirmed', () => {
  assert.equal(assertSuccessfulReceipt({ status: 'success' }).status, 'success');
  assert.throws(
    () => assertSuccessfulReceipt({ status: 'reverted' }),
    /mined but reverted/,
  );
});

test('AutoFlow cannot sign send or bridge tasks without individual review', () => {
  assert.equal(canAutoExecuteWalletTask('faucet'), true);
  assert.equal(canAutoExecuteWalletTask('send'), false);
  assert.equal(canAutoExecuteWalletTask('bridge'), false);
});

test('Arc Testnet RPC resolver rejects plaintext and malformed endpoints', () => {
  assert.equal(resolveArcTestnetRpcUrl('https://rpc.example.com/'), 'https://rpc.example.com');
  assert.equal(resolveArcTestnetRpcUrl('http://rpc.example.com'), 'https://rpc.testnet.arc.network');
  assert.equal(resolveArcTestnetRpcUrl('not-a-url'), 'https://rpc.testnet.arc.network');
});

test('payment intent amount normalization preserves token precision', () => {
  assert.equal(normalizePaymentAmount('0.00000001'), '0.00000001');
  assert.equal(normalizePaymentAmount('001.23000000'), '1.23');
  assert.equal(normalizePaymentAmount('0,000127'), '0.000127');
  assert.equal(normalizePaymentAmount('invalid'), '0');
});

test('universal payment routing never pretends an unavailable route is executable', () => {
  assert.equal(buildUniversalPaymentPlan({
    tokenSymbol: 'USDC',
    amountRaw: 1_000_000n,
    arcBalanceRaw: 2_000_000n,
    unifiedConfigured: false,
    memoRequested: false,
    hasAlternativeArcBalance: false,
  }).route, 'direct');

  assert.equal(buildUniversalPaymentPlan({
    tokenSymbol: 'EURC',
    amountRaw: 1_000_000n,
    arcBalanceRaw: 2_000_000n,
    unifiedConfigured: false,
    memoRequested: true,
    hasAlternativeArcBalance: false,
  }).route, 'memo');

  assert.equal(buildUniversalPaymentPlan({
    tokenSymbol: 'USDC',
    amountRaw: 2_000_000n,
    arcBalanceRaw: 500_000n,
    unifiedUsdcRaw: 3_000_000n,
    unifiedConfigured: true,
    memoRequested: false,
    hasAlternativeArcBalance: false,
  }).route, 'unified_balance');

  const swapFirst = buildUniversalPaymentPlan({
    tokenSymbol: 'EURC',
    amountRaw: 2_000_000n,
    arcBalanceRaw: 0n,
    unifiedConfigured: false,
    memoRequested: false,
    hasAlternativeArcBalance: true,
  });
  assert.equal(swapFirst.route, 'swap_first');
  assert.equal(swapFirst.canSubmit, false);
});

test('batch payout validation enforces unique recipients and total balance', () => {
  const first = '0x1111111111111111111111111111111111111111';
  const second = '0x2222222222222222222222222222222222222222';
  const valid = validateBatchDraft([
    { address: first, amount: '1.25' },
    { address: second, amount: '2.75' },
  ], 5_000_000n);
  assert.equal(valid.valid, true);
  assert.equal(valid.totalRaw, 4_000_000n);

  const duplicate = validateBatchDraft([
    { address: first, amount: '1' },
    { address: first.toUpperCase().replace('0X', '0x'), amount: '1' },
  ], 5_000_000n);
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.error ?? '', /unique/);

  const insufficient = validateBatchDraft([
    { address: first, amount: '3' },
    { address: second, amount: '3' },
  ], 5_000_000n);
  assert.equal(insufficient.valid, false);
  assert.match(insufficient.error ?? '', /Insufficient/);
});

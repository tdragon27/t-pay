import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityDedupeKey,
  applyPaymentIntentTransition,
  buildMerchantPaymentIntentId,
  calculateSplitProgress,
  dedupeByActivityKey,
  resolveBalanceFallback,
  splitPaymentGuard,
} from '../utils/tpayLogic';
import { decimalInputToBigInt, getDecimalInputError, normalizeDecimalInput, sanitizeDecimalInput } from '../utils/format';

test('payment intent status transitions are terminal-safe', () => {
  assert.equal(applyPaymentIntentTransition('draft', 'submit'), 'pending');
  assert.equal(applyPaymentIntentTransition('pending', 'confirm'), 'confirmed');
  assert.equal(applyPaymentIntentTransition('pending', 'fail'), 'failed');
  assert.equal(applyPaymentIntentTransition('draft', 'cancel'), 'cancelled');
  assert.equal(applyPaymentIntentTransition('confirmed', 'fail'), 'confirmed');
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

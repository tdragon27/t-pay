import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ERC20_TRANSFER_TOPIC,
  findVerifiedTransfer,
  formatUnitsDecimal,
  type ArcTransactionReceipt,
} from '../supabase/functions/_shared/arcTransfer';

const TX_HASH = `0x${'a'.repeat(64)}`;
const USDC = '0x3600000000000000000000000000000000000000';
const PAYER = '0x1111111111111111111111111111111111111111';
const RECEIVER = '0x2222222222222222222222222222222222222222';

function addressTopic(address: string) {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;
}

function receipt(overrides: Partial<ArcTransactionReceipt> = {}): ArcTransactionReceipt {
  return {
    status: '0x1',
    transactionHash: TX_HASH,
    blockNumber: '0x10',
    logs: [{
      address: USDC,
      topics: [ERC20_TRANSFER_TOPIC, addressTopic(PAYER), addressTopic(RECEIVER)],
      data: `0x${1_250_000n.toString(16).padStart(64, '0')}`,
    }],
    ...overrides,
  };
}

test('Arc receipt verifier accepts only a confirmed USDC transfer to the split receiver', () => {
  const transfer = findVerifiedTransfer(receipt(), TX_HASH, USDC, RECEIVER);
  assert.ok(transfer);
  assert.equal(transfer.payerWallet, PAYER);
  assert.equal(transfer.receiverWallet, RECEIVER);
  assert.equal(transfer.amountUnits, 1_250_000n);
  assert.equal(formatUnitsDecimal(transfer.amountUnits, 6), '1.25');
});

test('Arc receipt verifier rejects failed, wrong-token, wrong-recipient and wrong-hash receipts', () => {
  assert.equal(findVerifiedTransfer(receipt({ status: '0x0' }), TX_HASH, USDC, RECEIVER), null);
  assert.equal(findVerifiedTransfer(receipt(), TX_HASH, '0x3333333333333333333333333333333333333333', RECEIVER), null);
  assert.equal(findVerifiedTransfer(receipt(), TX_HASH, USDC, '0x4444444444444444444444444444444444444444'), null);
  assert.equal(findVerifiedTransfer(receipt(), `0x${'b'.repeat(64)}`, USDC, RECEIVER), null);
});

test('database migration closes anon payment mutation and makes tx hashes idempotent', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260713_harden_split_payment_authority.sql'),
    'utf8',
  );

  assert.match(migration, /drop policy if exists "split_bills_public_update"/i);
  assert.match(migration, /drop policy if exists "participants_public_update"/i);
  assert.match(migration, /revoke update, delete on public\.split_bills from anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.mark_participant_paid[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.record_split_received[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /tx_hash text primary key/i);
  assert.match(migration, /grant execute on function public\.apply_verified_split_payment[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /create policy "split_bills_public_update"/i);
  assert.doesNotMatch(migration, /create policy "participants_public_update"/i);
});

test('mobile split service uses the receipt verifier instead of privileged payment RPCs', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'services', 'splitBillService.ts'), 'utf8');
  assert.match(service, /functions\.invoke\('verify-split-payment'/);
  assert.doesNotMatch(service, /\.rpc\('mark_participant_paid'/);
  assert.doesNotMatch(service, /\.rpc\('record_split_received'/);
  assert.match(service, /A confirmed Arc transaction hash is required/);
});

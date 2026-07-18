import { createClient } from 'npm:@supabase/supabase-js@2';
import { findVerifiedTransfer, formatUnitsDecimal, type ArcTransactionReceipt } from '../_shared/arcTransfer.ts';

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const ARC_TESTNET_CHAIN_ID_HEX = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;
const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TX_HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Arc RPC returned HTTP ${response.status}.`);
    const payload = await response.json() as { result?: T; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message ?? 'Arc RPC request failed.');
    return payload.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const rpcUrl = Deno.env.get('ARC_RPC_URL')?.trim() || 'https://rpc.testnet.arc.network';
  if (!supabaseUrl || !serviceRoleKey) return json(503, { error: 'Split payment verifier is not configured.' });
  if (!rpcUrl.startsWith('https://')) return json(503, { error: 'Arc RPC must use HTTPS.' });

  let body: { splitId?: unknown; participantId?: unknown; txHash?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const splitId = typeof body.splitId === 'string' ? body.splitId : '';
  const participantId = typeof body.participantId === 'string' && body.participantId ? body.participantId : null;
  const txHash = typeof body.txHash === 'string' ? body.txHash.toLowerCase() : '';
  if (!UUID_PATTERN.test(splitId) || (participantId !== null && !UUID_PATTERN.test(participantId))) {
    return json(400, { error: 'Invalid split payment identifier.' });
  }
  if (!TX_HASH_PATTERN.test(txHash)) return json(400, { error: 'Invalid transaction hash.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: bill, error: billError } = await admin
    .from('split_bills')
    .select('id,receiver_wallet,status,expires_at')
    .eq('id', splitId)
    .maybeSingle();
  if (billError) return json(503, { error: 'Unable to load split bill.' });
  if (!bill) return json(404, { error: 'Split bill not found.' });
  if (bill.status !== 'open') return json(409, { error: 'Split bill does not accept payments.' });
  if (bill.expires_at && Date.now() > Date.parse(bill.expires_at)) return json(409, { error: 'Split bill is expired.' });

  if (participantId) {
    const { data: participant, error: participantError } = await admin
      .from('participants')
      .select('id')
      .eq('id', participantId)
      .eq('split_bill_id', splitId)
      .maybeSingle();
    if (participantError) return json(503, { error: 'Unable to load split participant.' });
    if (!participant) return json(404, { error: 'Split participant not found.' });
  }

  try {
    const chainId = await rpc<string>(rpcUrl, 'eth_chainId', []);
    if (chainId.toLowerCase() !== ARC_TESTNET_CHAIN_ID_HEX) {
      return json(503, { error: 'Arc RPC returned the wrong chain.' });
    }

    const receipt = await rpc<ArcTransactionReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
    if (!receipt) return json(202, { error: 'Transaction is not confirmed yet.', pending: true });

    const transfer = findVerifiedTransfer(receipt, txHash, ARC_USDC_ADDRESS, bill.receiver_wallet);
    if (!transfer) {
      return json(422, { error: 'Transaction does not contain a confirmed Arc Testnet USDC payment to this split.' });
    }

    const amountUsdc = formatUnitsDecimal(transfer.amountUnits, USDC_DECIMALS);
    const { data, error } = await admin.rpc('apply_verified_split_payment', {
      p_split_bill_id: splitId,
      p_participant_id: participantId,
      p_tx_hash: txHash,
      p_chain_id: ARC_TESTNET_CHAIN_ID,
      p_token_address: ARC_USDC_ADDRESS,
      p_payer_wallet: transfer.payerWallet,
      p_receiver_wallet: transfer.receiverWallet,
      p_amount_usdc: amountUsdc,
      p_block_number: transfer.blockNumber.toString(),
    });
    if (error) return json(409, { error: error.message });

    const result = Array.isArray(data) ? data[0] : data;
    return json(200, { ok: true, amountUsdc, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify Arc payment.';
    return json(503, { error: message });
  }
});

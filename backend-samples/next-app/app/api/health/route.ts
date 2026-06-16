import { NextResponse } from 'next/server';
import { listIndexedInvoices } from '../../../lib/merchantIndexer';

export const runtime = 'nodejs';

export async function GET() {
  const invoices = await listIndexedInvoices();
  return NextResponse.json({
    ok: true,
    indexer: {
      configured: Boolean(process.env.MERCHANT_SETTLEMENT_ADDRESS),
      invoicesCount: invoices.length,
      syncedAt: Date.now(),
    },
  }, { status: 200 });
}


import { NextRequest, NextResponse } from 'next/server';
import { getSyncedMerchantHistory } from '../../../../../lib/invoiceMetadataStore';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, context: { params: Promise<{ address: string }> | { address: string } }) {
  const resolved = 'then' in context.params ? await context.params : context.params;
  const invoices = await getSyncedMerchantHistory(resolved.address);

  return NextResponse.json({ invoices, count: invoices.length }, { status: 200 });
}

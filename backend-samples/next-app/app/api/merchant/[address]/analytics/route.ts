import { NextRequest, NextResponse } from 'next/server';
import { getMerchantHistory } from '../../../../../lib/merchantIndexer';
import { buildMerchantAnalyticsSummary } from '../../../../../lib/merchantAnalytics';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, context: { params: Promise<{ address: string }> | { address: string } }) {
  const resolved = 'then' in context.params ? await context.params : context.params;
  const invoices = await getMerchantHistory(resolved.address);
  const analytics = buildMerchantAnalyticsSummary(invoices);

  return NextResponse.json({ analytics, invoicesCount: invoices.length }, { status: 200 });
}

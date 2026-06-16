import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../lib/cache';
import { listSyncedInvoices, syncedInvoiceSchema, upsertInvoiceMetadata } from '../../../lib/invoiceMetadataStore';

export const runtime = 'nodejs';

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function GET() {
  const invoices = await listSyncedInvoices();
  return NextResponse.json({ invoices, count: invoices.length }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`invoice-sync:${clientKey(request)}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = syncedInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invoice payload.', details: parsed.error.flatten() }, { status: 400 });
  }

  const invoice = upsertInvoiceMetadata(parsed.data);
  return NextResponse.json({ invoice }, { status: 201 });
}

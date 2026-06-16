import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/cache';
import { getSyncedInvoice, invoicePatchSchema, patchInvoiceMetadata } from '../../../../lib/invoiceMetadataStore';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> | { id: string } };

async function resolveParams(context: Context) {
  return 'then' in context.params ? await context.params : context.params;
}

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function GET(_request: NextRequest, context: Context) {
  const resolved = await resolveParams(context);
  const invoice = await getSyncedInvoice(resolved.id);

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  return NextResponse.json({ invoice }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const limit = checkRateLimit(`invoice-patch:${clientKey(request)}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  const resolved = await resolveParams(context);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = invoicePatchSchema.safeParse({ ...(body as object), id: resolved.id });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invoice patch.', details: parsed.error.flatten() }, { status: 400 });
  }

  const invoice = patchInvoiceMetadata(resolved.id, parsed.data);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice metadata not found. POST the invoice first.' }, { status: 404 });
  }

  return NextResponse.json({ invoice }, { status: 200 });
}

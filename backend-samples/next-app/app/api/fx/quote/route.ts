import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/cache';
import { fxQuoteRequestSchema, getNormalizedFxQuote } from '../../../../lib/fx';

export const runtime = 'nodejs';

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`fx:${clientKey(request)}`, 40, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please retry shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = fxQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid quote request.', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await getNormalizedFxQuote(parsed.data);
    return NextResponse.json(quote, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Live FX quote unavailable.' },
      { status: 503 },
    );
  }
}

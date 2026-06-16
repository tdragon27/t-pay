import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/cache';

export const runtime = 'nodejs';

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`fx-execute:${clientKey(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please retry shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.quote) {
    return NextResponse.json({ error: 'Missing quote payload.' }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: 'StableFX execution route is not enabled in this sample backend yet.',
      hint: 'Use the mobile DEX fallback path or wire a production settlement executor behind this endpoint.',
    },
    { status: 501 },
  );
}

'use client';

import { useState } from 'react';

type Currency = 'USDC' | 'USDT' | 'EURC';

interface QuoteResponse {
  source: 'STABLEFX' | 'DEX';
  fromToken: Currency;
  toToken: Currency;
  amountIn: string;
  amountOut: string;
  minOut: number;
  rate: number;
  fee: number;
  priceImpact: number;
  deadline: number;
  note: string;
}

export function FxPanel() {
  const [from, setFrom] = useState<Currency>('USDC');
  const [to, setTo] = useState<Currency>('EURC');
  const [amount, setAmount] = useState('250');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchQuote() {
    setLoading(true);
    setError(null);
    setQuote(null);

    try {
      const response = await fetch('/api/fx/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromSymbol: from,
          toSymbol: to,
          amount,
          localCurrency: 'VND',
          amountMode: 'EXACT_INPUT',
          slippageBps: 50,
          deadlineSeconds: 90,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to fetch quote');
      }

      setQuote(payload);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to fetch quote');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-900/40 bg-slate-950/80 p-6 text-slate-100 shadow-2xl shadow-cyan-950/30">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Stablecoin FX</p>
          <h2 className="mt-2 text-2xl font-semibold">Protected quote console</h2>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          Auto fallback
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <select className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3" value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
          <option value="EURC">EURC</option>
        </select>
        <select className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3" value={to} onChange={(e) => setTo(e.target.value as Currency)}>
          <option value="EURC">EURC</option>
          <option value="USDT">USDT</option>
          <option value="USDC">USDC</option>
        </select>
        <input className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
      </div>

      <button onClick={fetchQuote} className="mt-5 rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
        {loading ? 'Requesting quote...' : 'Request executable quote'}
      </button>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      {quote && (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Best executable quote</p>
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">{quote.source}</span>
          </div>
          <p className="mt-3 text-3xl font-semibold">{quote.amountOut} {quote.toToken}</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <p>Rate: {quote.rate.toFixed(4)}</p>
            <p>Minimum receive: {quote.minOut.toFixed(4)} {quote.toToken}</p>
            <p>Fee: {quote.fee.toFixed(4)} {quote.fromToken}</p>
            <p>Price impact: {quote.priceImpact.toFixed(2)}%</p>
          </div>
          <p className="mt-3 text-sm text-slate-400">{quote.note}</p>
          <p className="mt-2 text-xs text-slate-500">Expires in {Math.max(0, Math.round((quote.deadline - Date.now()) / 1000))}s</p>
        </div>
      )}
    </section>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

interface MerchantInvoice {
  id: string;
  merchantAddress: string;
  amount: string;
  tokenSymbol: string;
  displayAmount: string;
  displayCurrency: 'USD' | 'VND';
  status: 'open' | 'paid' | 'cancelled' | 'expired';
  settleMode: 'contract' | 'transfer' | 'local';
  txHash?: string;
  payerAddress?: string;
  createdAt?: number;
  paidAt?: number;
  blockTimestamp?: number;
  fxRate?: number;
  feeAmount?: string;
}

function shortAddress(value?: string) {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function csvEscape(value: unknown) {
  const raw = String(value ?? '');
  return raw.includes(',') || raw.includes('"') || raw.includes('\n') ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadCsv(rows: MerchantInvoice[]) {
  const headers = ['id', 'txHash', 'blockTimestamp', 'token', 'amount', 'fxRate', 'fee', 'status', 'payer', 'createdAt', 'paidAt'];
  const body = rows.map((row) => [row.id, row.txHash, row.blockTimestamp, row.tokenSymbol, row.amount, row.fxRate, row.feeAmount, row.status, row.payerAddress, row.createdAt, row.paidAt].map(csvEscape).join(','));
  const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tpay-merchant-history-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MerchantDashboard() {
  const [merchantAddress, setMerchantAddress] = useState('');
  const [rows, setRows] = useState<MerchantInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = merchantAddress.trim();

  useEffect(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
      setRows([]);
      return;
    }

    let active = true;
    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/merchant/${normalized}/history`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Unable to load merchant history');
        if (active) setRows(payload.invoices ?? payload.history ?? []);
      } catch (err: any) {
        if (active) setError(err?.message ?? 'Unable to load merchant history');
      } finally {
        if (active) setLoading(false);
      }
    }

    hydrate();
    const timer = setInterval(hydrate, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [normalized]);

  const metrics = useMemo(() => {
    const paid = rows.filter((row) => row.status === 'paid');
    const closed = rows.filter((row) => row.status !== 'open');
    const byDay = paid.reduce<Record<string, number>>((acc, row) => {
      const day = new Date(row.paidAt ?? row.createdAt ?? Date.now()).toISOString().slice(0, 10);
      acc[day] = (acc[day] ?? 0) + Number(row.amount || 0);
      return acc;
    }, {});
    const chart = Object.entries(byDay).slice(-30);
    return {
      open: rows.filter((row) => row.status === 'open').length,
      paid: paid.length,
      expired: rows.filter((row) => row.status === 'expired').length,
      cancelled: rows.filter((row) => row.status === 'cancelled').length,
      gross: paid.reduce((sum, row) => sum + Number(row.amount), 0),
      successRate: closed.length === 0 ? 0 : (paid.length / closed.length) * 100,
      chart,
      maxChart: Math.max(1, ...chart.map(([, value]) => value)),
    };
  }, [rows]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-slate-100 shadow-2xl shadow-slate-950/40">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">Merchant POS Pro</p>
          <h2 className="mt-2 text-2xl font-semibold">Read-only merchant dashboard</h2>
          <p className="mt-2 text-sm text-slate-400">Enter a merchant wallet to load indexed Arc testnet invoices, settlement status, and CSV export.</p>
        </div>
        <button onClick={() => downloadCsv(rows)} disabled={rows.length === 0} className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
          Export CSV
        </button>
      </div>

      <input
        value={merchantAddress}
        onChange={(event) => setMerchantAddress(event.target.value)}
        placeholder="0x merchant wallet address"
        className="mb-6 w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 font-mono text-sm text-slate-100 outline-none ring-cyan-400/20 placeholder:text-slate-600 focus:ring-4"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Paid revenue" value={`$${metrics.gross.toFixed(2)}`} accent="text-emerald-300" />
        <MetricCard label="Open invoices" value={String(metrics.open)} accent="text-cyan-300" />
        <MetricCard label="Paid invoices" value={String(metrics.paid)} accent="text-emerald-300" />
        <MetricCard label="Success rate" value={`${metrics.successRate.toFixed(1)}%`} accent="text-amber-300" />
      </div>

      <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/45 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">30-day revenue</h3>
          <span className="text-xs text-slate-500">CSS mini chart</span>
        </div>
        <div className="flex h-36 items-end gap-2">
          {metrics.chart.length === 0 ? <p className="text-sm text-slate-500">No paid invoices yet.</p> : metrics.chart.map(([day, value]) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-2">
              <div title={`${day}: ${value.toFixed(2)} USDC`} className="w-full rounded-t-xl bg-cyan-400/80" style={{ height: `${Math.max(8, (value / metrics.maxChart) * 120)}px` }} />
              <span className="text-[10px] text-slate-600">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1fr] gap-3 bg-slate-900 px-5 py-4 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span>Invoice</span><span>Payer</span><span>Token</span><span>Status</span><span>Settlement</span>
        </div>
        {loading ? <div className="px-5 py-6 text-sm text-slate-400">Loading merchant index...</div> : rows.length === 0 ? <div className="px-5 py-6 text-sm text-slate-400">No invoices for this merchant yet.</div> : rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1fr] gap-3 border-t border-slate-800 px-5 py-4 text-sm">
            <div><p className="font-medium">{row.id}</p><p className="mt-1 text-slate-500">{row.displayAmount} {row.displayCurrency}</p></div>
            <span className="truncate">{shortAddress(row.payerAddress)}</span>
            <span>{row.amount} {row.tokenSymbol}</span>
            <span className={row.status === 'paid' ? 'text-emerald-300' : row.status === 'open' ? 'text-cyan-300' : 'text-amber-300'}>{row.status}</span>
            <span className="text-slate-400">{row.txHash ? shortAddress(row.txHash) : row.settleMode}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p><p className={`mt-3 text-3xl font-semibold ${accent}`}>{value}</p></div>;
}

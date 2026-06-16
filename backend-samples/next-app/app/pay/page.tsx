import Link from 'next/link';

export default async function PayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const invoice = String(params.invoice ?? params.invoiceId ?? '');
  const amount = String(params.amount ?? '');
  const token = String(params.token ?? 'USDC');
  const merchant = String(params.merchant ?? 'T Pay merchant');
  const deepLink = invoice ? `tpay://pay?invoiceId=${encodeURIComponent(invoice)}` : 'tpay://scan';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#083344,transparent_42%),linear-gradient(180deg,#020617,#020617)] px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-cyan-500/20 bg-slate-950/85 p-8 shadow-2xl shadow-cyan-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">T Pay request</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Pay invoice on Arc Testnet</h1>
        <p className="mt-4 text-slate-400">Open the T Pay mobile app to complete this payment with Arc-native USDC settlement.</p>

        <div className="mt-8 space-y-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex justify-between gap-4"><span className="text-slate-500">Merchant</span><span className="text-right font-medium">{merchant}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Invoice</span><span className="text-right font-mono text-sm">{invoice || 'Not provided'}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Amount</span><span className="text-right font-semibold text-cyan-300">{amount || 'Open amount'} {token}</span></div>
        </div>

        <a href={deepLink} className="mt-8 block rounded-2xl bg-cyan-400 px-5 py-4 text-center font-semibold text-slate-950">Open in T Pay</a>
        <Link href="/dashboard" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-300">Merchant dashboard</Link>
        <p className="mt-6 text-xs leading-5 text-slate-500">Testnet only. Do not send mainnet assets to this request.</p>
      </div>
    </main>
  );
}


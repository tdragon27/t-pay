import { FxPanel } from '../../components/fx-panel';
import { MerchantDashboard } from '../../components/merchant-dashboard';

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0b2530,transparent_45%),linear-gradient(180deg,#020617,#020617_60%,#07111d)] px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">T Pay Upgrade</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Onchain FX + Merchant Settlement</h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              A web companion dashboard for Arc-native swaps, QR checkout, payment links, and exportable merchant history.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            Low-fee settlement on Arc
          </div>
        </header>

        <FxPanel />
        <MerchantDashboard />
      </div>
    </main>
  );
}


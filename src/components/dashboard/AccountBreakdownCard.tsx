import { fmtGBP } from "@/lib/format";
import type { AccountBreakdownRow } from "@/components/dashboard/usePortfolioOverviewInsights";

type AccountBreakdownCardProps = {
  accounts: AccountBreakdownRow[];
  totalValue: number;
  onOpenAccount: (id: string) => void;
  onOpenProvider: (id: string) => void;
  onOpenPortfolio: (id: string) => void;
};

function percent(value: number, total: number) {
  return total > 0 ? `${(value / total * 100).toFixed(1)}%` : "0.0%";
}

function GainValue({ value }: { value: number }) {
  return (
    <span className="text-right text-xs tabular-nums" style={{ color: value >= 0 ? "#34d399" : "#f87171" }}>
      {value >= 0 ? "+" : "−"}{fmtGBP(Math.abs(value))}
    </span>
  );
}

export function AccountBreakdownCard({ accounts, totalValue, onOpenAccount, onOpenProvider, onOpenPortfolio }: AccountBreakdownCardProps) {
  return (
    <section className="min-w-0 xl:col-span-2 xl:pr-8" aria-labelledby="accounts-heading">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 id="accounts-heading" className="text-sm font-medium text-white">Accounts &amp; providers</h2>
        <span className="text-[11px] text-zinc-600">{accounts.length} accounts</span>
      </div>

      {accounts.length === 0 ? (
        <p className="border-y border-white/[0.06] py-6 text-sm text-zinc-500">Create an account to organize your portfolios.</p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            <span>Account</span>
            <span className="text-right">Value</span>
            <span className="whitespace-nowrap text-right">Unrealized P/L</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {accounts.map((account) => (
              <div key={account.id}>
                <button type="button" onClick={() => onOpenAccount(account.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.025]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{account.name}</span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-zinc-600">{percent(account.value, totalValue)} of total</span>
                  </span>
                  <span className="text-right text-sm tabular-nums text-zinc-200">{fmtGBP(account.value)}</span>
                  <GainValue value={account.gain} />
                </button>
                {account.children.map((child) => child.kind === "direct" ? (
                  <div key={`${account.id}-direct`} className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-2 text-xs text-zinc-500">
                    <span className="min-w-0 truncate pl-6">Direct holdings</span>
                    <span className="text-right tabular-nums text-zinc-400">{fmtGBP(child.value)}</span>
                    <GainValue value={child.gain} />
                  </div>
                ) : (
                  <button key={child.id} type="button" onClick={() => child.kind === "provider" ? onOpenProvider(child.id) : onOpenPortfolio(child.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-white/[0.025]">
                    <span className="min-w-0 truncate pl-6 text-xs text-zinc-400">{child.name}</span>
                    <span className="text-right text-xs tabular-nums text-zinc-400">{fmtGBP(child.value)}</span>
                    <GainValue value={child.gain} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

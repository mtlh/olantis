import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="glass-card overflow-hidden xl:col-span-2">
      <CardHeader className="border-b border-white/5">
        <CardTitle className="text-white">Accounts &amp; providers</CardTitle>
        <CardDescription>Portfolio values and their share of your tracked investments.</CardDescription>
      </CardHeader>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-b border-white/[0.06] px-4 py-2 text-[9px] uppercase tracking-wider text-zinc-600">
        <span>Group</span><span>Share</span><span className="w-24 text-right">Value</span><span className="w-24 text-right">Unrealized P/L</span>
      </div>
      <CardContent className="p-0">
        {accounts.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Create an account to organize your portfolios.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {accounts.map((account) => (
              <div key={account.id}>
                <button type="button" onClick={() => onOpenAccount(account.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.035]">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{account.name}</span>
                  <span className="text-right text-xs tabular-nums text-zinc-500">{percent(account.value, totalValue)}</span>
                  <span className="w-24 text-right text-sm font-medium tabular-nums text-white">{fmtGBP(account.value)}</span>
                  <span className="w-24"><GainValue value={account.gain} /></span>
                </button>
                {account.children.map((child) => child.kind === "direct" ? (
                  <div key={`${account.id}-direct`} className="flex items-center gap-3 bg-white/[0.015] px-4 py-2 pl-8 text-xs text-zinc-500">
                    <span className="min-w-0 flex-1">Direct holdings</span>
                    <span className="w-24 text-right tabular-nums">{percent(child.value, totalValue)}</span>
                    <span className="w-24 text-right tabular-nums text-zinc-300">{fmtGBP(child.value)}</span>
                    <span className="w-24"><GainValue value={child.gain} /></span>
                  </div>
                ) : (
                  <button key={child.id} type="button" onClick={() => child.kind === "provider" ? onOpenProvider(child.id) : onOpenPortfolio(child.id)} className="flex w-full items-center gap-3 bg-white/[0.015] px-4 py-2 pl-8 text-left transition-colors hover:bg-white/[0.04]">
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">↳ {child.name}</span>
                    <span className="text-right text-[11px] tabular-nums text-zinc-600">{account.value > 0 ? `${(child.value / account.value * 100).toFixed(1)}% of account` : "0.0%"}</span>
                    <span className="w-24 text-right text-xs tabular-nums text-zinc-300">{fmtGBP(child.value)}</span>
                    <span className="w-24"><GainValue value={child.gain} /></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import type { ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Account, Portfolio, Provider } from "@/lib/store";
import { fmtGBP, fmtPct, fmtRelative } from "@/lib/format";

type PortfolioDashboardProps = {
  portfolio: Portfolio;
  accounts: Account[];
  providers: Provider[];
  color: string | null;
  dateFormat: string;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  onBack: () => void;
  onEdit: () => void;
  onAddHolding: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function PortfolioDashboard({
  portfolio,
  accounts,
  providers,
  color,
  dateFormat,
  value,
  cost,
  gain,
  gainPct,
  onBack,
  onEdit,
  onAddHolding,
  onDelete,
  children,
}: PortfolioDashboardProps) {
  const accent = color ?? "#60a5fa";

  return (
    <DashboardLevel label={`${portfolio.name} portfolio`}>
      <div className="relative overflow-hidden rounded-2xl border p-6 md:p-8" style={{ borderColor: `${accent}40`, background: `linear-gradient(to bottom right, ${accent}2A, ${accent}12)` }}>
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full blur-3xl" style={{ background: `${accent}26` }} />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{portfolio.name}</h1>
              <Badge variant="outline" className="border-white/10 bg-white/5 capitalize text-zinc-300">{portfolio.type}</Badge>
              {portfolio.accountId && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">{accounts.find((account) => account.id === portfolio.accountId)?.name ?? ""}</Badge>}
              {portfolio.providerId && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-500">{providers.find((provider) => provider.id === portfolio.providerId)?.name ?? ""}</Badge>}
            </div>
            <p className="mt-2 text-sm text-zinc-500">{portfolio.holdings.length} holdings • {portfolio.type} • updated {fmtRelative(Math.max(...portfolio.holdings.map((holding) => holding.lastRefreshedAt ?? 0), 0) || null, dateFormat)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={onBack}>← Overview</Button>
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button onClick={onAddHolding}><Plus className="h-4 w-4" /> Add holding</Button>
            <Button variant="ghost" className="border border-white/5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</Button>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
          <div className="rounded-xl border-l-4 bg-white p-4 text-black" style={{ borderLeftColor: accent }}>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Value</div>
            <div className="mt-1 text-2xl font-bold">{fmtGBP(value)}</div>
            <div className="mt-1 text-xs text-zinc-600">Cost {fmtGBP(cost)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Return</div>
            <div className="flex items-center gap-2 text-2xl font-bold" style={{ color: gain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(gain)} <span className="text-sm">{fmtPct(gainPct)}</span></div>
            <div className="mt-1 text-xs text-zinc-500">All time</div>
          </div>
        </div>
      </div>
      {children}
    </DashboardLevel>
  );
}

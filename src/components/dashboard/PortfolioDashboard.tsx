import type { ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { Button } from "@/components/ui/button";
import type { Account, Portfolio, Provider } from "@/lib/store";
import { fmtGBP, fmtPct, fmtRelative } from "@/lib/format";

type PortfolioDashboardProps = {
  portfolio: Portfolio;
  accounts: Account[];
  providers: Provider[];
  dateFormat: string;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  staleCount: number;
  onBack: () => void;
  onEdit: () => void;
  onAddHolding: () => void;
  onDelete: () => void;
  children: ReactNode;
};

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

export function PortfolioDashboard({
  portfolio,
  accounts,
  providers,
  dateFormat,
  value,
  cost,
  gain,
  gainPct,
  staleCount,
  onBack,
  onEdit,
  onAddHolding,
  onDelete,
  children,
}: PortfolioDashboardProps) {
  const parentName = portfolio.providerId
    ? providers.find((provider) => provider.id === portfolio.providerId)?.name
    : portfolio.accountId ? accounts.find((account) => account.id === portfolio.accountId)?.name : null;
  const backLabel = parentName ?? "Overview";
  const holdingCount = portfolio.holdings.length;
  const latestRefresh = Math.max(...portfolio.holdings.map((holding) => holding.lastRefreshedAt ?? 0), 0) || null;
  const gainColor = gain >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <DashboardLevel label={`${portfolio.name} portfolio`}>
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-zinc-500 transition-colors hover:text-white"
        >
          ← {backLabel}
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">{portfolio.name}</h1>
              <span className="text-[11px] capitalize text-zinc-500">{portfolio.type}</span>
              {portfolio.accountId && (
                <span className="text-[11px] text-zinc-600">
                  {accounts.find((account) => account.id === portfolio.accountId)?.name ?? ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onAddHolding}>
              <Plus className="h-3.5 w-3.5" />
              Add holding
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Delete portfolio"
              className="rounded-full px-2.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 sm:px-3"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.4fr_1fr_1fr] lg:gap-0 lg:py-7">
          <div className="col-span-2 lg:col-span-1 lg:pr-8">
            <p className={LABEL}>Total value</p>
            <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">
              {fmtGBP(value)}
            </p>
            <p className={SUB}>Cost basis {fmtGBP(cost)}</p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Unrealized gain</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${gainColor}`}>
              {gain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(gain))}
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(gainPct)}</span>
            </p>
            <p className={SUB}>Current positions</p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:pl-8">
            <p className={LABEL}>Holdings</p>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">{holdingCount}</p>
            <p className={SUB}>
              Updated {fmtRelative(latestRefresh, dateFormat)}
              {staleCount > 0 && <span className="text-amber-300/80"> · {staleCount} stale</span>}
            </p>
          </div>
        </div>
      </div>
      {children}
    </DashboardLevel>
  );
}

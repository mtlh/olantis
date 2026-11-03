import type { ReactNode } from "react";
import { Plus, RefreshCw, Loader2 } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtGBP, fmtPct, fmtSnapshotDate, type ValueChange } from "@/lib/format";

type MainDashboardProps = {
  accountsCount: number;
  providersCount: number;
  portfoliosCount: number;
  latestSnapshot: string;
  holdingCount: number;
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  periodChange: ValueChange | null;
  range: "1M" | "3M" | "1Y" | "MAX";
  isLoading: boolean;
  refreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  onNewPortfolio: () => void;
  onCreateFirstPortfolio: () => void;
  children: ReactNode;
};

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

export function MainDashboard({
  accountsCount,
  providersCount,
  portfoliosCount,
  latestSnapshot,
  holdingCount,
  totalValue,
  totalCost,
  totalGain,
  totalGainPct,
  periodChange,
  range,
  isLoading,
  refreshing,
  canRefresh,
  onRefresh,
  onNewPortfolio,
  onCreateFirstPortfolio,
  children,
}: MainDashboardProps) {
  const gainColor = totalGain >= 0 ? "text-emerald-400" : "text-red-400";
  const changeColor = periodChange && periodChange.amount >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <DashboardLevel label="Main dashboard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">Dashboard</h1>
          <p className="mt-2 text-xs text-zinc-500">
            {accountsCount} accounts · {providersCount} providers · {portfoliosCount} portfolios
            <span className="mx-1.5 text-zinc-700">·</span>
            <span className="whitespace-nowrap">Updated {fmtSnapshotDate(latestSnapshot)}</span>
          </p>
          {portfoliosCount === 0 && (
            <Button variant="link" size="xs" className="mt-1 h-auto p-0 text-xs text-zinc-500" onClick={onCreateFirstPortfolio}>Create your first portfolio</Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
            onClick={onRefresh}
            disabled={refreshing || !canRefresh}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh prices
          </Button>
          <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onNewPortfolio}>
            <Plus className="h-3.5 w-3.5" /> New portfolio
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-6 border-y border-white/[0.06] py-7 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.75fr] lg:gap-0">
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className={index === 4 ? "hidden lg:block" : undefined}>
              <Skeleton className="h-2.5 w-20 bg-white/[0.07]" />
              <Skeleton className="mt-3 h-8 w-28 bg-white/[0.09]" />
              <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.05]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.75fr] lg:gap-0 lg:py-7">
          <div className="col-span-2 lg:col-span-1 lg:pr-8">
            <p className={LABEL}>Total value</p>
            <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">{fmtGBP(totalValue)}</p>
            <p className={SUB}>Cost basis {fmtGBP(totalCost)}<span className="lg:hidden"> · {holdingCount} holdings</span></p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Unrealized gain</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${gainColor}`}>
              {totalGain >= 0 ? "+" : ""}{fmtGBP(totalGain)}
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(totalGainPct)}</span>
            </p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Change · {range}</p>
            {periodChange ? (
              <>
                <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${changeColor}`}>
                  {periodChange.amount >= 0 ? "+" : "−"}{fmtGBP(Math.abs(periodChange.amount))}
                  <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{periodChange.percent == null ? "" : fmtPct(periodChange.percent)}</span>
                </p>
                <p className={SUB}>Since {fmtSnapshotDate(periodChange.fromDate)}</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-600">—</p>
                <p className={SUB}>More history needed</p>
              </>
            )}
          </div>

          <div className="hidden lg:block lg:border-l lg:border-white/[0.06] lg:pl-8">
            <p className={LABEL}>Holdings</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-white">{holdingCount}</p>
            <p className={SUB}>{portfoliosCount} portfolios</p>
          </div>
        </div>
      )}

      {children}
    </DashboardLevel>
  );
}

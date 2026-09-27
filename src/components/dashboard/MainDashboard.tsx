import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Wallet, Plus, RefreshCw, Loader2 } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtGBP, fmtPct, type ValueChange } from "@/lib/format";

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
  return (
    <DashboardLevel label="Main dashboard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">{accountsCount} accounts • {providersCount} providers • {portfoliosCount} portfolios</p>
          <p className="mt-1 text-xs text-zinc-600">Latest saved valuation {latestSnapshot} · totals shown in GBP{portfoliosCount === 0 && <><span className="mx-1">•</span><Button variant="link" size="xs" className="h-auto p-0 text-xs" onClick={onCreateFirstPortfolio}>Create first portfolio</Button></>}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-white/10 bg-white/5" onClick={onRefresh} disabled={refreshing || !canRefresh}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh prices
          </Button>
          <Button size="sm" onClick={onNewPortfolio}><Plus className="h-4 w-4" /> New portfolio</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3].map((index) => <Card key={index} className="glass-card p-6"><Skeleton className="mb-4 h-6 w-24 bg-white/10" /><Skeleton className="h-8 w-32 bg-white/10" /><Skeleton className="mt-2 h-4 w-20 bg-white/10" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Total value</CardTitle><Wallet className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent><div className="tabular-nums text-3xl font-bold text-white">{fmtGBP(totalValue)}</div><p className="mt-1 text-xs text-zinc-500">Cost {fmtGBP(totalCost)}</p></CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Unrealized gain</CardTitle>{totalGain >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
            </CardHeader>
            <CardContent><div className="tabular-nums text-3xl font-bold" style={{ color: totalGain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(totalGain)} <span className="text-sm font-medium">{fmtPct(totalGainPct)}</span></div><p className="mt-1 text-xs text-zinc-500">Current positions only</p></CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Value change · {range}</CardTitle>{periodChange && periodChange.amount >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
            </CardHeader>
            <CardContent>
              {periodChange ? <>
                <div className="tabular-nums text-3xl font-bold" style={{ color: periodChange.amount >= 0 ? "#34d399" : "#f87171" }}>{periodChange.amount >= 0 ? "+" : "−"}{fmtGBP(Math.abs(periodChange.amount))} <span className="text-sm font-medium">{periodChange.percent == null ? "" : fmtPct(periodChange.percent)}</span></div>
                <p className="mt-1 text-xs text-zinc-500">Since {periodChange.fromDate} · trades can affect value</p>
              </> : <>
                <div className="text-3xl font-bold text-zinc-500">—</div>
                <p className="mt-1 text-xs text-zinc-500">More saved history needed</p>
              </>}
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Holdings</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-white">{holdingCount}</div><p className="mt-1 text-xs text-zinc-500">{accountsCount} accounts • {portfoliosCount} portfolios</p></CardContent>
          </Card>
        </div>
      )}
      {children}
    </DashboardLevel>
  );
}

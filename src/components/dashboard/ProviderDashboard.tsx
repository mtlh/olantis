"use client";

import { useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { AllocationCard, type AllocationItem } from "@/components/dashboard/shared/AllocationCard";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { ValueTimeChart, type ValueTimeChartRow } from "@/components/dashboard/ValueTimeChart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { Snapshot } from "@/lib/store";
import { chartDateLabel, filterByRange, fmtGBP, fmtPct, fmtRelative, todayISODate, valueChangeOverRange } from "@/lib/format";

type ProviderPortfolioSummary = {
  id: string;
  name: string;
  color: string;
  value: number;
  gain: number;
  holdingsCount: number;
};

type ProviderHoldingSummary = {
  id: string;
  symbol: string;
  name: string;
  value: number;
  gain: number;
};

type ProviderDashboardProps = {
  name: string;
  accountName: string;
  color: string;
  dateFormat: string;
  portfolios: ProviderPortfolioSummary[];
  directHoldings: ProviderHoldingSummary[];
  history: Snapshot[];
  allocation: AllocationItem[];
  holdingCount: number;
  latestRefresh: number | null;
  staleCount: number;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  onBack: () => void;
  onRename: (name: string) => Promise<void>;
  onNewPortfolio: () => void;
  onDelete: () => void;
  onOpenPortfolio: (id: string) => void;
  onOpenHolding: (id: string) => void;
};

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

function formatSnapshotDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function shareOfProvider(value: number, total: number) {
  return total > 0 ? `${(value / total * 100).toFixed(1)}%` : "0.0%";
}

function SignedGain({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`tabular-nums ${value >= 0 ? "text-emerald-400" : "text-red-400"} ${className}`}>
      {value >= 0 ? "+" : "−"}{fmtGBP(Math.abs(value))}
    </span>
  );
}

export function ProviderDashboard({
  name,
  accountName,
  color,
  dateFormat,
  portfolios,
  directHoldings,
  history,
  allocation,
  holdingCount,
  latestRefresh,
  staleCount,
  value,
  cost,
  gain,
  gainPct,
  onBack,
  onRename,
  onNewPortfolio,
  onDelete,
  onOpenPortfolio,
  onOpenHolding,
}: ProviderDashboardProps) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const chartData = useMemo<ValueTimeChartRow[]>(() => {
    const rows = filterByRange(history, range);
    if (!rows.length) return [{ date: chartDateLabel(todayISODate()), dateISO: todayISODate(), total: value }];
    return rows.map((row) => ({ date: chartDateLabel(row.date), dateISO: row.date, total: row.value }));
  }, [history, range, value]);
  const periodChange = useMemo(() => valueChangeOverRange(history, range, value), [history, range, value]);
  const hasPositions = portfolios.length > 0 || directHoldings.length > 0;
  const gainColor = gain >= 0 ? "text-emerald-400" : "text-red-400";
  const changeColor = periodChange && periodChange.amount >= 0 ? "text-emerald-400" : "text-red-400";

  const saveName = async () => {
    const trimmed = editName.trim();
    if (trimmed.length < 2) return toast({ title: "Name too short", variant: "error" });
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditOpen(false);
      toast({ title: "Provider renamed", variant: "success" });
    } catch (error) {
      toast({ title: "Rename failed", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLevel label={`${name} provider`}>
      <div>
        <button type="button" onClick={onBack} className="text-[11px] text-zinc-500 transition-colors hover:text-white">← {accountName}</button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="min-w-0 truncate text-[28px] font-semibold leading-none tracking-tight text-white">{name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => { setEditName(name); setEditOpen(true); }}>Edit</Button>
            <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onNewPortfolio}>
              <Plus className="h-3.5 w-3.5" /> New portfolio
            </Button>
            <Button variant="ghost" size="sm" aria-label="Delete provider" className="rounded-full px-2.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 sm:px-3" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {portfolios.length} {portfolios.length === 1 ? "portfolio" : "portfolios"}
          <span className="mx-1.5 text-zinc-700">·</span>{holdingCount} {holdingCount === 1 ? "holding" : "holdings"}
        </p>
        <p className="mt-1 text-[11px] text-zinc-600 lg:hidden">
          Prices updated {fmtRelative(latestRefresh, dateFormat)}{staleCount > 0 ? ` · ${staleCount} stale` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.75fr] lg:gap-0 lg:py-7">
        <div className="col-span-2 lg:col-span-1 lg:pr-8">
          <p className={LABEL}>Value</p>
          <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">{fmtGBP(value)}</p>
          <p className={SUB}>Cost basis {fmtGBP(cost)}</p>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
          <p className={LABEL}>Unrealized gain</p>
          <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${gainColor}`}>
            {gain >= 0 ? "+" : ""}{fmtGBP(gain)}
            <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(gainPct)}</span>
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
              <p className={SUB}>Since {formatSnapshotDate(periodChange.fromDate)}</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-600">—</p>
              <p className={SUB}>More history needed</p>
            </>
          )}
        </div>

        <div className="hidden lg:block lg:border-l lg:border-white/[0.06] lg:pl-8">
          <p className={LABEL}>Prices</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${staleCount > 0 ? "text-amber-300/90" : "text-white"}`}>
            {staleCount > 0 ? `${staleCount} stale` : "Up to date"}
          </p>
          <p className={SUB}>Updated {fmtRelative(latestRefresh, dateFormat)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ValueTimeChart
          data={chartData}
          title="Value over time"
          range={range}
          onRangeChange={setRange}
          color={color}
          totalName={name}
          surface="panel"
          className="min-w-0 lg:col-span-3"
        />
        <div className="min-w-0 lg:col-span-2">
          <AllocationCard allocation={allocation} mode="holding" onModeChange={() => {}} layout="fill" showModeSelector={false} compactChart surface="panel" emptyMessage="No holdings in this provider yet" />
        </div>
      </div>

      <section aria-labelledby="provider-tree-heading">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <h2 id="provider-tree-heading" className="text-sm font-medium text-white">Portfolios &amp; holdings</h2>
        </div>

        {!hasPositions ? (
          <p className="border-y border-white/[0.06] py-6 text-sm text-zinc-500">Add a portfolio or holding to start tracking this provider.</p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
              <span>Name</span>
              <span className="text-right">Value</span>
              <span className="hidden whitespace-nowrap text-right sm:block">Unrealized P/L</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {portfolios.map((portfolio) => (
                <button key={portfolio.id} type="button" onClick={() => onOpenPortfolio(portfolio.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{portfolio.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] tabular-nums text-zinc-600">
                        {portfolio.holdingsCount} {portfolio.holdingsCount === 1 ? "holding" : "holdings"}
                        <span className="hidden sm:inline"> · {shareOfProvider(portfolio.value, value)} of provider</span>
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums text-zinc-200">{fmtGBP(portfolio.value)}</span>
                    <SignedGain value={portfolio.gain} className="mt-0.5 block text-[11px] sm:hidden" />
                  </span>
                  <SignedGain value={portfolio.gain} className="hidden text-right text-xs sm:block" />
                </button>
              ))}
              {directHoldings.map((holding) => (
                <button key={holding.id} type="button" onClick={() => onOpenHolding(holding.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[9px] font-semibold tracking-wide text-zinc-400">{holding.symbol.slice(0, 3)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{holding.symbol}</span>
                      <span className="mt-0.5 block truncate text-[11px] tabular-nums text-zinc-600">
                        Holding · {holding.name}
                        <span className="hidden sm:inline"> · {shareOfProvider(holding.value, value)} of provider</span>
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums text-zinc-200">{fmtGBP(holding.value)}</span>
                    <SignedGain value={holding.gain} className="mt-0.5 block text-[11px] sm:hidden" />
                  </span>
                  <SignedGain value={holding.gain} className="hidden text-right text-xs sm:block" />
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-white/10 bg-zinc-900 text-white">
          <DialogHeader><DialogTitle>Edit provider</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input id="provider-name" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveName()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLevel>
  );
}

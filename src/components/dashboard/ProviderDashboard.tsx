"use client";

import { useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { AllocationCard, type AllocationItem } from "@/components/dashboard/shared/AllocationCard";
import { BreakdownHeader, BreakdownRow } from "@/components/dashboard/shared/BreakdownList";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { ValueTimeChart, type ValueTimeChartRow } from "@/components/dashboard/ValueTimeChart";
import { BrandIcon, ProviderIcon } from "@/components/BrandIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { Metric, MetricStrip } from "@/components/shared/MetricStrip";
import { NameEditDialog } from "@/components/shared/NameEditDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Button } from "@/components/ui/button";
import type { Snapshot } from "@/lib/store";
import { chartDateLabel, filterByRange, fmtGBP, fmtPct, fmtRelative, fmtSnapshotDate, percentOf, plural, todayISODate, valueChangeOverRange } from "@/lib/format";

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
  exchange?: string | null;
  currency?: string | null;
  value: number;
  gain: number;
};

type ProviderDashboardProps = {
  name: string;
  icon?: string | null;
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
  onRename: (name: string) => Promise<void>;
  onNewPortfolio: () => void;
  onDelete: () => void;
  onOpenPortfolio: (id: string) => void;
  onOpenHolding: (id: string) => void;
};

const NOOP = () => {};

export function ProviderDashboard({
  name,
  icon,
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
  onRename,
  onNewPortfolio,
  onDelete,
  onOpenPortfolio,
  onOpenHolding,
}: ProviderDashboardProps) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const [editOpen, setEditOpen] = useState(false);
  const chartData = useMemo<ValueTimeChartRow[]>(() => {
    const rows = filterByRange(history, range);
    if (!rows.length) return [{ date: chartDateLabel(todayISODate()), dateISO: todayISODate(), total: value }];
    return rows.map((row) => ({ date: chartDateLabel(row.date), dateISO: row.date, total: row.value }));
  }, [history, range, value]);
  const periodChange = useMemo(() => valueChangeOverRange(history, range, value), [history, range, value]);
  const hasPositions = portfolios.length > 0 || directHoldings.length > 0;
  const gainTone = gain >= 0 ? "text-emerald-400" : "text-red-400";
  const changeTone = periodChange && periodChange.amount >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <DashboardLevel label={`${name} provider`}>
      <PageHeader
        icon={<ProviderIcon provider={{ name, icon }} size={28} />}
        title={name}
        description={
          <>
            {plural(portfolios.length, "portfolio")}
            <span className="mx-1.5 text-zinc-700">·</span>{plural(holdingCount, "holding")}
          </>
        }
        mobileDescription={
          <>
            Prices updated {fmtRelative(latestRefresh, dateFormat)}{staleCount > 0 ? ` · ${staleCount} stale` : ""}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onNewPortfolio}>
              <Plus className="h-3.5 w-3.5" /> New portfolio
            </Button>
            <Button variant="ghost" size="sm" aria-label="Delete provider" className="rounded-full px-2.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 sm:px-3" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </>
        }
      />

      <MetricStrip variant="overview">
        <Metric
          wide
          size="hero"
          position="first"
          label="Value"
          value={fmtGBP(value)}
          sub={`Cost basis ${fmtGBP(cost)}`}
        />

        <Metric
          position="middle"
          label="Unrealized gain"
          tone={gainTone}
          value={
            <>
              {gain >= 0 ? "+" : ""}{fmtGBP(gain)}
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(gainPct)}</span>
            </>
          }
        />

        <Metric
          position="middle"
          label={`Change · ${range}`}
          tone={periodChange ? changeTone : "text-zinc-400"}
          value={periodChange ? (
            <>
              {periodChange.amount >= 0 ? "+" : "−"}{fmtGBP(Math.abs(periodChange.amount))}
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{periodChange.percent == null ? "" : fmtPct(periodChange.percent)}</span>
            </>
          ) : "—"}
          sub={periodChange ? `Since ${fmtSnapshotDate(periodChange.fromDate)}` : "More history needed"}
        />

        <Metric
          position="last"
          className="hidden lg:block"
          label="Prices"
          tone={staleCount > 0 ? "text-amber-300/90" : "text-white"}
          value={staleCount > 0 ? `${staleCount} stale` : "Up to date"}
          sub={`Updated ${fmtRelative(latestRefresh, dateFormat)}`}
        />
      </MetricStrip>

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
          <AllocationCard allocation={allocation} mode="holding" onModeChange={NOOP} layout="fill" showModeSelector={false} compactChart surface="panel" emptyMessage="No holdings in this provider yet" />
        </div>
      </div>

      <section aria-labelledby="provider-tree-heading">
        <SectionHeading id="provider-tree-heading" title="Portfolios & holdings" />
        {!hasPositions ? (
          <EmptyState bordered size="sm" title="Add a portfolio or holding to start tracking this provider." />
        ) : (
          <>
            <BreakdownHeader />
            <div className="divide-y divide-white/[0.05]">
              {portfolios.map((portfolio) => (
                <BreakdownRow
                  key={portfolio.id}
                  icon={<Layers className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                  title={portfolio.name}
                  subtitle={
                    <>
                      {plural(portfolio.holdingsCount, "holding")}
                      <span className="hidden sm:inline"> · {percentOf(portfolio.value, value)} of provider</span>
                    </>
                  }
                  value={portfolio.value}
                  gain={portfolio.gain}
                  onClick={() => onOpenPortfolio(portfolio.id)}
                />
              ))}
              {directHoldings.map((holding) => (
                <BreakdownRow
                  key={holding.id}
                  icon={<BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} currency={holding.currency} size={28} />}
                  title={holding.symbol}
                  subtitle={
                    <>
                      Holding · {holding.name}
                      <span className="hidden sm:inline"> · {percentOf(holding.value, value)} of provider</span>
                    </>
                  }
                  value={holding.value}
                  gain={holding.gain}
                  onClick={() => onOpenHolding(holding.id)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {editOpen && (
        <NameEditDialog
          title="Edit provider"
          inputId="provider-name"
          initialName={name}
          successMessage="Provider renamed"
          onOpenChange={setEditOpen}
          onSave={onRename}
        />
      )}
    </DashboardLevel>
  );
}

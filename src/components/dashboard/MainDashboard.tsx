import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { Metric, MetricStrip, MetricStripSkeleton } from "@/components/shared/MetricStrip";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
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
  onNewPortfolio,
  onCreateFirstPortfolio,
  children,
}: MainDashboardProps) {
  const gainTone = totalGain >= 0 ? "text-emerald-400" : "text-red-400";
  const changeTone = periodChange && periodChange.amount >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <DashboardLevel label="Main dashboard">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {accountsCount} accounts · {providersCount} providers · {portfoliosCount} portfolios
            <span className="mx-1.5 text-zinc-700">·</span>
            <span className="whitespace-nowrap">Updated {fmtSnapshotDate(latestSnapshot)}</span>
          </>
        }
        actions={
          <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onNewPortfolio}>
            <Plus className="h-3.5 w-3.5" /> New portfolio
          </Button>
        }
        below={portfoliosCount === 0 ? (
          <Button variant="link" size="xs" className="mt-1 h-auto p-0 text-xs text-zinc-500" onClick={onCreateFirstPortfolio}>
            Create your first portfolio
          </Button>
        ) : null}
      />

      {isLoading ? (
        <MetricStripSkeleton />
      ) : (
        <MetricStrip variant="overview">
          <Metric
            wide
            size="hero"
            position="first"
            label="Total value"
            value={fmtGBP(totalValue)}
            sub={<>Cost basis {fmtGBP(totalCost)}<span className="lg:hidden"> · {holdingCount} holdings</span></>}
          />

          <Metric
            position="middle"
            label="Unrealized gain"
            tone={gainTone}
            value={
              <>
                {totalGain >= 0 ? "+" : ""}{fmtGBP(totalGain)}
                <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(totalGainPct)}</span>
              </>
            }
          />

          <Metric
            position="middle"
            label={`Change · ${range}`}
            tone={periodChange ? changeTone : "text-zinc-600"}
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
            label="Holdings"
            value={holdingCount}
            sub={`${portfoliosCount} portfolios`}
          />
        </MetricStrip>
      )}

      {children}
    </DashboardLevel>
  );
}

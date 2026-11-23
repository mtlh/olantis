"use client";

import { useMemo, type ReactNode } from "react";
import { LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";
import { DashboardGoalCard } from "@/components/dashboard/DashboardGoalCard";
import { PriceFreshnessCard } from "@/components/dashboard/PriceFreshnessCard";
import { PortfolioInsightsSection } from "@/components/dashboard/PortfolioInsightsSection";
import { ValueTimeChart, type ValueTimeChartDot, type ValueTimeChartRow, type ValueTimeChartSeries } from "@/components/dashboard/ValueTimeChart";
import { AllocationCard, type AllocationItem } from "@/components/dashboard/shared/AllocationCard";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import type { AllocationMode } from "@/components/dashboard/usePortfolioAllocation";
import type { OverviewPositionInsights, AccountBreakdownRow, PositionMover } from "@/components/dashboard/usePortfolioOverviewInsights";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { SignedValue, signedTone } from "@/components/shared/SignedValue";
import { TradeRow } from "@/components/shared/TradeRow";
import { Button } from "@/components/ui/button";
import { holdingValueGBP, fmtGBP, fmtPct, percentOf, plural, type FxRates, type ValueChange } from "@/lib/format";
import { dashboardWidgetDefinition, type DashboardWidget } from "@/lib/dashboards";
import type { Holding, Portfolio, SavedDashboard, Transaction } from "@/lib/store";
import { cn } from "@/lib/utils";

type CustomDashboardProps = {
  dashboard: SavedDashboard;
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  periodChange: ValueChange | null;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  chartData: ValueTimeChartRow[];
  chartDots: ValueTimeChartDot[];
  overviewSeries: ValueTimeChartSeries[];
  allocation: AllocationItem[];
  allocMode: AllocationMode;
  onAllocModeChange: (mode: AllocationMode) => void;
  emptyAllocationContent: ReactNode;
  breakdown: AccountBreakdownRow[];
  insights: OverviewPositionInsights;
  periodMovers: { strongest: PositionMover | null; weakest: PositionMover | null };
  portfolios: Portfolio[];
  directHoldings: Holding[];
  transactions: Transaction[];
  staleHoldings: Holding[];
  fxRates: FxRates;
  dateFormat: string;
  showTradeMarkers: boolean;
  onOpenAccount: (id: string) => void;
  onOpenProvider: (id: string) => void;
  onOpenPortfolio: (id: string) => void;
  onSelectHolding: (holding: Holding) => void;
  onViewGoals: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function WidgetSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel min-w-0 overflow-hidden p-4", className)}>{children}</section>;
}

function OverviewWidget({
  totalValue,
  totalCost,
  totalGain,
  totalGainPct,
  periodChange,
  range,
}: Pick<CustomDashboardProps, "totalValue" | "totalCost" | "totalGain" | "totalGainPct" | "periodChange" | "range">) {
  return (
    <WidgetSurface>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Total value</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-white sm:text-[28px]">{fmtGBP(totalValue)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Cost basis</p>
          <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-zinc-200 sm:text-2xl">{fmtGBP(totalCost)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Unrealized gain</p>
          <p className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", signedTone(totalGain))}>
            {totalGain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(totalGain))}
            <span className="ml-1.5 text-[11px] font-normal opacity-70">{fmtPct(totalGainPct)}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Change · {range}</p>
          <p className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", periodChange ? signedTone(periodChange.amount) : "text-zinc-400")}>
            {periodChange ? (
              <>
                {periodChange.amount >= 0 ? "+" : "−"}{fmtGBP(Math.abs(periodChange.amount))}
                <span className="ml-1.5 text-[11px] font-normal opacity-70">{periodChange.percent == null ? "" : fmtPct(periodChange.percent)}</span>
              </>
            ) : "—"}
          </p>
        </div>
      </div>
    </WidgetSurface>
  );
}

function HoldingsWidget({
  portfolios,
  directHoldings,
  totalValue,
  fxRates,
  onSelectHolding,
}: Pick<CustomDashboardProps, "portfolios" | "directHoldings" | "totalValue" | "fxRates" | "onSelectHolding">) {
  const positions = useMemo(() => {
    const rows: Array<{ holding: Holding; value: number; context: string }> = [];
    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        rows.push({ holding, value: holdingValueGBP(holding, fxRates), context: portfolio.name });
      }
    }
    for (const holding of directHoldings) {
      rows.push({ holding, value: holdingValueGBP(holding, fxRates), context: "Direct holding" });
    }
    return rows.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [directHoldings, fxRates, portfolios]);

  return (
    <WidgetSurface>
      <SectionHeading title="Top holdings" meta={plural(positions.length, "position")} spacing="tight" divider />
      {positions.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">No holdings yet.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {positions.map(({ holding, value, context }) => (
            <button
              key={holding.id}
              type="button"
              onClick={() => onSelectHolding(holding)}
              className="flex w-full items-center gap-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.025]"
            >
              <BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} currency={holding.currency} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-zinc-100">{holding.symbol}</span>
                <span className="block truncate text-[10px] text-zinc-400">{context}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs tabular-nums text-zinc-200">{fmtGBP(value)}</span>
                <span className="block text-[10px] tabular-nums text-zinc-400">{percentOf(value, totalValue)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </WidgetSurface>
  );
}

function AccountsWidget({
  breakdown,
  totalValue,
  onOpenAccount,
  onOpenProvider,
  onOpenPortfolio,
}: Pick<CustomDashboardProps, "breakdown" | "totalValue" | "onOpenAccount" | "onOpenProvider" | "onOpenPortfolio">) {
  return (
    <WidgetSurface>
      <SectionHeading title="Accounts" meta={plural(breakdown.length, "account")} spacing="tight" divider />
      {breakdown.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">Create an account to organize your portfolios.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {breakdown.map((account) => (
            <div key={account.id}>
              <button type="button" onClick={() => onOpenAccount(account.id)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-white/[0.025]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-100">{account.name}</span>
                  <span className="block text-[10px] tabular-nums text-zinc-400">{percentOf(account.value, totalValue)} of total</span>
                </span>
                <span className="text-xs tabular-nums text-zinc-200">{fmtGBP(account.value)}</span>
                <SignedValue value={account.gain} className="w-20 text-right text-[11px]" />
              </button>
              {account.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => child.kind === "provider" ? onOpenProvider(child.id) : onOpenPortfolio(child.id)}
                  className="flex w-full items-center gap-3 py-1.5 pl-4 text-left transition-colors hover:bg-white/[0.025]"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">{child.kind === "direct" ? "Direct holdings" : child.name}</span>
                  <span className="text-[11px] tabular-nums text-zinc-400">{fmtGBP(child.value)}</span>
                  <SignedValue value={child.gain} className="w-20 text-right text-[11px]" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </WidgetSurface>
  );
}

function TradesWidget({ transactions, dateFormat }: Pick<CustomDashboardProps, "transactions" | "dateFormat">) {
  const recent = transactions.slice(0, 8);
  return (
    <WidgetSurface>
      <SectionHeading title="Recent trades" meta={plural(transactions.length, "trade")} spacing="tight" divider />
      {recent.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">No trades recorded yet.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {recent.map((trade) => (
            <TradeRow
              key={trade.id}
              symbol={trade.symbol}
              type={trade.type}
              shares={trade.shares}
              price={Number(trade.price)}
              date={trade.date}
              dateFormat={dateFormat}
              showTotal={false}
            />
          ))}
        </div>
      )}
    </WidgetSurface>
  );
}

export function CustomDashboard(props: CustomDashboardProps) {
  const {
    dashboard,
    range,
    onRangeChange,
    chartData,
    chartDots,
    overviewSeries,
    allocation,
    allocMode,
    onAllocModeChange,
    emptyAllocationContent,
    insights,
    periodMovers,
    totalValue,
    staleHoldings,
    dateFormat,
    showTradeMarkers,
    onSelectHolding,
    onViewGoals,
    onEdit,
    onDelete,
  } = props;

  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case "overview":
        return <OverviewWidget {...props} />;
      case "chart":
        return (
          <ValueTimeChart
            data={chartData}
            title="Value over time"
            range={range}
            onRangeChange={onRangeChange}
            series={overviewSeries}
            dots={chartDots}
            showTradeMarkers={showTradeMarkers}
            showSeriesToggle
            surface="panel"
          />
        );
      case "allocation":
        return (
          <AllocationCard
            allocation={allocation}
            mode={allocMode}
            onModeChange={onAllocModeChange}
            surface="panel"
            emptyContent={emptyAllocationContent}
          />
        );
      case "accounts":
        return <AccountsWidget {...props} />;
      case "holdings":
        return <HoldingsWidget {...props} />;
      case "goal":
        return (
          <WidgetSurface>
            <DashboardGoalCard currentValue={totalValue} onViewGoals={onViewGoals} />
          </WidgetSurface>
        );
      case "freshness":
        return (
          <WidgetSurface>
            <PriceFreshnessCard staleHoldings={staleHoldings} dateFormat={dateFormat} onSelectHolding={onSelectHolding} />
          </WidgetSurface>
        );
      case "trades":
        return <TradesWidget transactions={props.transactions} dateFormat={dateFormat} />;
      case "insights":
        return (
          <WidgetSurface>
            <PortfolioInsightsSection insights={insights} periodMovers={periodMovers} totalValue={totalValue} range={range} />
          </WidgetSurface>
        );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={dashboard.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {dashboard.color && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: dashboard.color }} />}
            <span>{plural(dashboard.widgets.length, "widget")}</span>
            <span className="text-zinc-600">·</span>
            <span>Custom dashboard</span>
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit layout
            </Button>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-red-300" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </>
        }
      />

      {dashboard.widgets.length === 0 ? (
        <div className="panel grid place-items-center px-6 py-16 text-center">
          <div>
            <LayoutGrid className="mx-auto h-6 w-6 text-zinc-500" />
            <p className="mt-3 text-sm text-zinc-300">This dashboard has no widgets yet.</p>
            <Button variant="ghost" size="sm" className="mt-2 text-zinc-400 hover:text-white" onClick={onEdit}>Add widgets</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {dashboard.widgets.map((widget) => (
            <div key={widget.id} className={cn("min-w-0", widget.size === "full" && "lg:col-span-2")} aria-label={dashboardWidgetDefinition(widget.type).label}>
              {renderWidget(widget)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

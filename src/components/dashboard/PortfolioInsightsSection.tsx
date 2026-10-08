import { Activity, Clock3, Target, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtGBP, fmtRelative, type ValueChange } from "@/lib/format";
import type { OverviewPositionInsights, PositionMover } from "@/components/dashboard/usePortfolioOverviewInsights";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

type PortfolioInsightsSectionProps = {
  insights: OverviewPositionInsights;
  periodMovers: { strongest: PositionMover | null; weakest: PositionMover | null };
  totalValue: number;
  range: ChartRange;
  dateFormat: string;
};

function SignedAmount({ change }: { change: ValueChange }) {
  const positive = change.amount >= 0;
  return (
    <span style={{ color: positive ? "#34d399" : "#f87171" }}>
      {positive ? "+" : "−"}{fmtGBP(Math.abs(change.amount))}
    </span>
  );
}

export function PortfolioInsightsSection({ insights, periodMovers, totalValue, range, dateFormat }: PortfolioInsightsSectionProps) {
  const positionCount = insights.profitableCount + insights.losingCount + insights.unchangedCount;

  return (
    <section aria-labelledby="portfolio-insights-heading">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 id="portfolio-insights-heading" className="text-lg font-semibold text-white">Portfolio insights</h2>
          <p className="text-xs text-zinc-500 mt-1">A closer look across your entire account</p>
        </div>
        <span className="text-xs text-zinc-600">{insights.positions.length} positions tracked</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Position momentum</CardTitle>
            <Activity className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tabular-nums">{insights.profitableCount} <span className="text-sm font-medium text-zinc-500">gaining</span></div>
            {positionCount > 0 ? (
              <>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5 mt-3">
                  <span className="bg-emerald-400" style={{ width: `${insights.profitableCount / positionCount * 100}%` }} />
                  <span className="bg-red-400" style={{ width: `${insights.losingCount / positionCount * 100}%` }} />
                  <span className="bg-zinc-500" style={{ width: `${insights.unchangedCount / positionCount * 100}%` }} />
                </div>
                <p className="text-xs text-zinc-500 mt-2">{insights.losingCount} falling · {insights.unchangedCount} unchanged</p>
              </>
            ) : <p className="text-xs text-zinc-500 mt-2">Add positions with a cost basis to see momentum</p>}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Largest position</CardTitle>
            <Target className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {insights.largest ? (
              <>
                <div className="text-2xl font-bold text-white tabular-nums">{fmtGBP(insights.largest.value)}</div>
                <p className="text-xs text-zinc-500 mt-2 truncate" title={`${insights.largest.holding.symbol} · ${insights.largest.portfolioName}`}>
                  <span className="text-zinc-300">{insights.largest.holding.symbol}</span> · {totalValue > 0 ? `${(insights.largest.value / totalValue * 100).toFixed(1)}% of account` : "0.0% of account"}
                </p>
                {totalValue > 0 && insights.largest.value / totalValue >= 0.25 && <p className="mt-2 text-xs text-amber-300">Concentration alert · over 25% in one position</p>}
              </>
            ) : <p className="text-sm text-zinc-500 mt-1">No positions yet</p>}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Position movers · {range}</CardTitle>
            <Trophy className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {periodMovers.strongest ? (
              <>
                <p className="text-xs text-zinc-500">Strongest · <span className="text-zinc-300">{periodMovers.strongest.holding.symbol}</span></p>
                <div className="mt-0.5 text-xl font-bold tabular-nums"><SignedAmount change={periodMovers.strongest.change} /></div>
                {periodMovers.weakest && periodMovers.weakest.holding.id !== periodMovers.strongest.holding.id
                  ? <p className="mt-2 text-xs text-zinc-500">Weakest · <span className="text-zinc-300">{periodMovers.weakest.holding.symbol}</span> · <SignedAmount change={periodMovers.weakest.change} /></p>
                  : <p className="mt-2 text-xs text-zinc-600">Not enough history for another position</p>}
                <p className="mt-2 text-[10px] text-zinc-600">Position value movement; trading activity affects it.</p>
              </>
            ) : <p className="text-sm text-zinc-500 mt-1">More holding history needed</p>}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Latest price update</CardTitle>
            <Clock3 className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{insights.latestRefresh ? fmtRelative(insights.latestRefresh, dateFormat) : "—"}</div>
            <p className="text-xs text-zinc-500 mt-2">
              {insights.latestRefresh
                ? `${insights.refreshedCount} of ${insights.positions.length} positions have a recorded update`
                : "No price updates recorded yet"}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

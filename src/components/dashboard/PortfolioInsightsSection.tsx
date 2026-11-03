import { fmtGBP, type ValueChange } from "@/lib/format";
import type { OverviewPositionInsights, PositionMover } from "@/components/dashboard/usePortfolioOverviewInsights";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

type PortfolioInsightsSectionProps = {
  insights: OverviewPositionInsights;
  periodMovers: { strongest: PositionMover | null; weakest: PositionMover | null };
  totalValue: number;
  range: ChartRange;
};

function SignedAmount({ change }: { change: ValueChange }) {
  const tone = change.amount > 0 ? "#34d399" : change.amount < 0 ? "#f87171" : "#a1a1aa";
  return (
    <span style={{ color: tone }}>
      {change.amount > 0 ? "+" : change.amount < 0 ? "−" : ""}{fmtGBP(Math.abs(change.amount))}
    </span>
  );
}

const LABEL = "text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600";

export function PortfolioInsightsSection({ insights, periodMovers, totalValue, range }: PortfolioInsightsSectionProps) {
  const positionCount = insights.profitableCount + insights.losingCount + insights.unchangedCount;

  return (
    <section aria-labelledby="portfolio-insights-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
        <h2 id="portfolio-insights-heading" className="text-sm font-medium text-white">Positions</h2>
        <span className="text-[11px] text-zinc-600">{insights.positions.length} tracked</span>
      </div>

      <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.06]">
        <div className="sm:pr-7">
          <p className={LABEL}>Momentum</p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums text-white">
            {insights.profitableCount} <span className="text-sm font-normal text-zinc-500">gaining</span>
          </p>
          {positionCount > 0 ? (
            <>
              <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="bg-emerald-400/80" style={{ width: `${insights.profitableCount / positionCount * 100}%` }} />
                <span className="bg-red-400/70" style={{ width: `${insights.losingCount / positionCount * 100}%` }} />
                <span className="bg-zinc-600" style={{ width: `${insights.unchangedCount / positionCount * 100}%` }} />
              </div>
              <p className="mt-2 text-[11px] tabular-nums text-zinc-600">{insights.losingCount} falling · {insights.unchangedCount} unchanged</p>
            </>
          ) : <p className="mt-2 text-[11px] text-zinc-600">No positions with a cost basis yet</p>}
        </div>

        <div className="sm:px-7">
          <p className={LABEL}>Largest position</p>
          {insights.largest ? (
            <>
              <p className="mt-1.5 text-lg font-semibold tabular-nums text-white">{fmtGBP(insights.largest.value)}</p>
              <p className="mt-2 truncate text-[11px] text-zinc-600" title={`${insights.largest.holding.symbol} · ${insights.largest.portfolioName}`}>
                <span className="text-zinc-400">{insights.largest.holding.symbol}</span> · {totalValue > 0 ? `${(insights.largest.value / totalValue * 100).toFixed(1)}% of portfolio` : "0.0% of portfolio"}
              </p>
              {totalValue > 0 && insights.largest.value / totalValue >= 0.25 && <p className="mt-1 text-[11px] text-amber-300/80">Over 25% in one position</p>}
            </>
          ) : <p className="mt-1.5 text-sm text-zinc-600">No positions yet</p>}
        </div>

        <div className="sm:pl-7">
          <p className={LABEL}>Movers · {range}</p>
          {periodMovers.strongest ? (
            periodMovers.strongest.change.amount === 0 ? (
              <>
                <p className="mt-1.5 text-lg font-semibold text-zinc-500">No change</p>
                <p className="mt-2 text-[11px] text-zinc-600">No position moved in this period</p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-lg font-semibold tabular-nums"><SignedAmount change={periodMovers.strongest.change} /></p>
                <p className="mt-2 text-[11px] text-zinc-600">
                  <span className="text-zinc-400">{periodMovers.strongest.holding.symbol}</span>
                  {periodMovers.weakest && periodMovers.weakest.holding.id !== periodMovers.strongest.holding.id && (
                    <> · weakest <span className="text-zinc-400">{periodMovers.weakest.holding.symbol}</span> <SignedAmount change={periodMovers.weakest.change} /></>
                  )}
                </p>
              </>
            )
          ) : <p className="mt-1.5 text-sm text-zinc-600">More position history needed</p>}
        </div>
      </div>
    </section>
  );
}

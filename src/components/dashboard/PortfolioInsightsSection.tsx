import { fmtGBP } from "@/lib/format";
import type { OverviewPositionInsights, PositionMover } from "@/components/dashboard/usePortfolioOverviewInsights";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { DistributionBar } from "@/components/shared/ProgressBar";
import { METRIC_LABEL } from "@/components/shared/MetricStrip";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { SignedValue } from "@/components/shared/SignedValue";

type PortfolioInsightsSectionProps = {
  insights: OverviewPositionInsights;
  periodMovers: { strongest: PositionMover | null; weakest: PositionMover | null };
  totalValue: number;
  range: ChartRange;
};

export function PortfolioInsightsSection({ insights, periodMovers, totalValue, range }: PortfolioInsightsSectionProps) {
  const positionCount = insights.profitableCount + insights.losingCount + insights.unchangedCount;

  return (
    <section aria-labelledby="portfolio-insights-heading">
      <SectionHeading
        id="portfolio-insights-heading"
        title="Positions"
        meta={`${insights.positions.length} tracked`}
        divider
        spacing="tight"
      />

      <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.06]">
        <div className="sm:pr-7">
          <p className={METRIC_LABEL}>Momentum</p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums text-white">
            {insights.profitableCount} <span className="text-sm font-normal text-zinc-400">gaining</span>
          </p>
          {positionCount > 0 ? (
            <>
              <DistributionBar
                className="mt-3"
                label="Positions gaining, falling and unchanged"
                segments={[
                  { key: "gaining", value: insights.profitableCount, color: "#34d399" },
                  { key: "falling", value: insights.losingCount, color: "#f87171" },
                  { key: "unchanged", value: insights.unchangedCount, color: "#52525b" },
                ]}
              />
              <p className="mt-2 text-[11px] tabular-nums text-zinc-400">{insights.losingCount} falling · {insights.unchangedCount} unchanged</p>
            </>
          ) : <p className="mt-2 text-[11px] text-zinc-400">No positions with a cost basis yet</p>}
        </div>

        <div className="sm:px-7">
          <p className={METRIC_LABEL}>Largest position</p>
          {insights.largest ? (
            <>
              <p className="mt-1.5 text-lg font-semibold tabular-nums text-white">{fmtGBP(insights.largest.value)}</p>
              <p className="mt-2 truncate text-[11px] text-zinc-400" title={`${insights.largest.holding.symbol} · ${insights.largest.portfolioName}`}>
                <span className="text-zinc-400">{insights.largest.holding.symbol}</span> · {totalValue > 0 ? `${(insights.largest.value / totalValue * 100).toFixed(1)}% of portfolio` : "0.0% of portfolio"}
              </p>
              {totalValue > 0 && insights.largest.value / totalValue >= 0.25 && <p className="mt-1 text-[11px] text-amber-300/80">Over 25% in one position</p>}
            </>
          ) : <p className="mt-1.5 text-sm text-zinc-400">No positions yet</p>}
        </div>

        <div className="sm:pl-7">
          <p className={METRIC_LABEL}>Movers · {range}</p>
          {periodMovers.strongest ? (
            periodMovers.strongest.change.amount === 0 ? (
              <>
                <p className="mt-1.5 text-lg font-semibold text-zinc-400">No change</p>
                <p className="mt-2 text-[11px] text-zinc-400">No position moved in this period</p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-lg font-semibold tabular-nums"><SignedValue value={periodMovers.strongest.change.amount} /></p>
                <p className="mt-2 text-[11px] text-zinc-400">
                  <span className="text-zinc-400">{periodMovers.strongest.holding.symbol}</span>
                  {periodMovers.weakest && periodMovers.weakest.holding.id !== periodMovers.strongest.holding.id && (
                    <> · weakest <span className="text-zinc-400">{periodMovers.weakest.holding.symbol}</span> <SignedValue value={periodMovers.weakest.change.amount} /></>
                  )}
                </p>
              </>
            )
          ) : <p className="mt-1.5 text-sm text-zinc-400">More position history needed</p>}
        </div>
      </div>
    </section>
  );
}

"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderPlus, Minus, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactions, useSettings, type Holding, type Transaction } from "@/lib/store";
import { fmtGBP, fmtPrice, fmtPct, fmtRelative, holdingCostGBP, holdingCurrency, holdingValueGBP, isListedSymbol, chartDateLabel, filterByRange, plural } from "@/lib/format";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { BrandIcon } from "@/components/BrandIcon";
import { ValueTimeChart, type ValueTimeChartDot, type ValueTimeChartRow } from "@/components/dashboard/ValueTimeChart";
import { EmptyState } from "@/components/shared/EmptyState";
import { Metric, MetricStrip } from "@/components/shared/MetricStrip";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { TradeRow } from "@/components/shared/TradeRow";

type PriceRow = { date: string; price: number };

function shortDate(iso: string, locale: string) {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function ChartPlaceholder({
  title,
  range,
  onRangeChange,
  message,
  detail,
  icon,
  className = "",
}: {
  title: string;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  message: string;
  detail?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="flex flex-row items-center justify-between gap-3 p-4">
        <h2 className="text-sm font-medium text-white">{title}</h2>
        <ChartRangeSelector range={range} onRangeChange={onRangeChange} segmented />
      </div>
      <div className="grid min-h-[420px] flex-1 place-items-center px-6 pb-6 text-center">
        <div>
          {icon}
          <p className="text-sm text-zinc-400">{message}</p>
          {detail && <p className="mt-1 text-xs text-zinc-600">{detail}</p>}
        </div>
      </div>
    </section>
  );
}

export function StockDetail({ holding, portfolioId, portfolioValue, portfolioName, color, onBuy, onSell, onAddToPortfolio }: { holding: Holding; portfolioId?: string | null; portfolioValue: number; portfolioName?: string; color: string; onBuy?: () => void; onSell?: () => void; onAddToPortfolio?: () => void }) {
  const { settings } = useSettings();
  // Derived rather than synced: the preference is the fallback and a manual pick
  // is an override, so no effect has to write range when settings load.
  const [rangeOverride, setRangeOverride] = useState<ChartRange | null>(null);
  const range: ChartRange = rangeOverride ?? settings.defaultRange;
  // Stable so the memoised chart does not re-render on unrelated state changes
  // (price fetch settling, trades loading, …).
  const pickRange = useCallback((r: ChartRange) => {
    setRangeOverride(r);
  }, []);
  const isListed = isListedSymbol(holding.symbol);
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [snapSeriesFull, setSnapSeries] = useState<PriceRow[] | null>(null);
  const { transactions } = useTransactions(portfolioId ?? null, portfolioId ? holding.symbol : null, portfolioId ? null : holding.id);

  // Reset chart state whenever the holding changes — otherwise the previous
  // symbol's series is shown under the new one until the fetch lands. Done as
  // render-time state adjustment (React's "derive state from props" pattern)
  // rather than in an effect, which would cascade an extra render.
  const [prevHoldingId, setPrevHoldingId] = useState(holding.id);
  if (prevHoldingId !== holding.id) {
    setPrevHoldingId(holding.id);
    setPrices(null);
    setSnapSeries(null);
  }

  useEffect(() => {
    let cancel = false;
    // Never paint a cached series: a demo tenant can be repaired server-side
    // between two opens, and a stale response would swap the full history back
    // to the single day it replaced.
    fetch(`/api/snapshots?holdingId=${encodeURIComponent(holding.id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const j = await r.json();
        const rows = (j.byHolding?.[holding.id]?.data ?? []) as Array<{ date: string; value: number }>;
        if (!cancel) setSnapSeries(rows.map((p) => ({ date: p.date, price: p.value })));
      })
      .catch(() => {
        if (!cancel) setSnapSeries([]);
      });
    return () => {
      cancel = true;
    };
  }, [holding.id]);

  useEffect(() => {
    if (!isListed) return;
    let cancel = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(holding.symbol)}&exchange=${encodeURIComponent(holding.exchange ?? "")}&range=${range}`)
      .then(async (r) => {
        const chart = r.ok ? ((await r.json()).chart as PriceRow[]) : [];
        if (!cancel) setPrices(chart);
      })
      .catch(() => {
        if (!cancel) setPrices([]);
      });
    return () => {
      cancel = true;
    };
  }, [isListed, holding.symbol, holding.exchange, range]);

  const hasValueSeries = (snapSeriesFull?.length ?? 0) >= 2;
  const snapSeries = useMemo(
    () => (hasValueSeries ? filterByRange(snapSeriesFull ?? [], range) : null),
    [hasValueSeries, snapSeriesFull, range]
  );
  const chartRows = useMemo<ValueTimeChartRow[]>(() => {
    const series = hasValueSeries ? snapSeries ?? [] : prices ?? [];
    return series.map((point) => ({ date: chartDateLabel(point.date), dateISO: point.date, total: point.price }));
  }, [hasValueSeries, snapSeries, prices]);
  const loading = !hasValueSeries && isListed && prices === null;

  const dots = useMemo<ValueTimeChartDot[]>(() => {
    if (!chartRows.length) return [];
    const map = new Map(chartRows.map((row) => [row.date, row.total]));
    return transactions
      .map((t: Transaction) => {
        const key = chartDateLabel(t.date);
        const y = map.get(key);
        if (y == null) return null;
        return { x: key, y, type: t.type, date: t.date, symbol: t.symbol };
      })
      .filter((x): x is ValueTimeChartDot => x !== null);
  }, [chartRows, transactions]);

  const val = holdingValueGBP(holding, settings.fxRates);
  const cost = holdingCostGBP(holding, settings.fxRates);
  const currency = holdingCurrency(holding);
  const gain = val - cost;
  const pct = cost ? (gain / cost) * 100 : 0;
  const weightPct = portfolioValue > 0 ? (val / portfolioValue) * 100 : null;
  const latestMarketMove = (() => {
    const last = prices?.at(-1);
    const prev = prices?.at(-2);
    if (!last || !prev || prev.price <= 0) return null;
    return { amount: last.price - prev.price, percent: (last.price / prev.price - 1) * 100, date: last.date };
  })();
  const isManual = !isListed;
  const gainTone = gain >= 0 ? "text-emerald-400" : "text-red-400";
  const moveTone = latestMarketMove ? (latestMarketMove.amount >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-600";
  const chartTitle = hasValueSeries ? "Value over time" : "Market price";

  return (
    <>
      <PageHeader
        icon={<BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} currency={holding.currency} size={32} shape="circle" />}
        title={holding.symbol}
        description={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span>{holding.name}</span>
            {holding.exchange && (
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{holding.exchange}</span>
            )}
            {portfolioName && (
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{portfolioName}</span>
            )}
          </div>
        }
        actions={
          <>
            {onBuy && onSell && (
              <>
                <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onBuy}><Plus className="h-3.5 w-3.5" /> Buy</Button>
                <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={onSell}><Minus className="h-3.5 w-3.5" /> Sell</Button>
              </>
            )}
            {!portfolioId && onAddToPortfolio && (
              <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={onAddToPortfolio} title="Move this holding into a portfolio"><FolderPlus className="h-3.5 w-3.5" /> Add to portfolio</Button>
            )}
          </>
        }
      />

      <MetricStrip variant="holding">
        <Metric
          wide
          size="hero"
          position="tight-first"
          label="Value"
          value={fmtGBP(val)}
          sub={<>Cost basis {fmtGBP(cost)}{weightPct == null ? "" : ` · ${weightPct.toFixed(1)}% weight`}</>}
        />

        <Metric
          position="tight-middle"
          label="Unrealized gain"
          tone={gainTone}
          value={
            <>
              <span className="whitespace-nowrap">{gain >= 0 ? "+" : ""}{fmtGBP(gain)}</span>
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(pct)}</span>
            </>
          }
        />

        <Metric
          position="tight-middle"
          label="Price"
          value={fmtPrice(holding.currentPrice, currency)}
          sub={`${currency} · updated ${fmtRelative(holding.lastRefreshedAt, settings.dateFormat)}`}
        />

        <Metric
          position="tight-middle"
          label="Shares"
          value={holding.shares}
          sub={`Avg ${fmtPrice(holding.avgPrice, currency)}`}
        />

        <Metric
          position="tight-last"
          label="Latest move"
          tone={moveTone}
          valueClassName="whitespace-nowrap"
          value={latestMarketMove ? `${latestMarketMove.amount >= 0 ? "+" : "−"}${fmtPrice(Math.abs(latestMarketMove.amount), currency)}` : "—"}
          sub={latestMarketMove ? `${fmtPct(latestMarketMove.percent)} · ${shortDate(latestMarketMove.date, settings.dateFormat)}` : "No recent quote history"}
        />
      </MetricStrip>

      <div className="flex flex-col gap-6">
        {isManual && !hasValueSeries ? (
          <ChartPlaceholder
            title={chartTitle}
            range={range}
            onRangeChange={pickRange}
            icon={<Wallet className="mx-auto mb-2 h-7 w-7 text-zinc-600" />}
            message="Manual holding — no market price history"
            detail="Value is tracked on the portfolio chart."
          />
        ) : loading ? (
          <ChartPlaceholder title={chartTitle} range={range} onRangeChange={pickRange} message="Loading price history…" />
        ) : chartRows.length === 0 ? (
          <ChartPlaceholder title={chartTitle} range={range} onRangeChange={pickRange} message={`No price data available for ${holding.symbol}.`} />
        ) : (
          <ValueTimeChart
            data={chartRows}
            title={chartTitle}
            range={range}
            onRangeChange={pickRange}
            color={color}
            totalName={hasValueSeries ? "Value" : `${holding.symbol} price`}
            currency={hasValueSeries ? undefined : currency}
            dots={dots}
            showTradeMarkers={settings.showTradeMarkers}
            surface="panel"
            heightClassName="h-[320px] sm:h-[420px]"
          />
        )}

        <section aria-labelledby="holding-trades-heading" className="min-w-0">
          <SectionHeading
            id="holding-trades-heading"
            title="Trades"
            meta={transactions.length ? `${plural(transactions.length, "trade")} recorded` : "None yet"}
            divider
            spacing="tight"
          />
          {transactions.length === 0 ? (
            <EmptyState bordered="top" size="sm" className="border-b border-white/[0.06]" title="Buy or sell this holding to start a trade history." />
          ) : (
            <div className="max-h-[360px] divide-y divide-white/[0.05] overflow-auto">
              {transactions.slice(0, 50).map((t) => (
                <TradeRow
                  key={t.id}
                  type={t.type}
                  shares={t.shares}
                  price={Number(t.price)}
                  date={t.date}
                  dateFormat={settings.dateFormat}
                  currency={currency}
                  showSymbol={false}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

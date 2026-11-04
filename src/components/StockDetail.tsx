"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, FolderPlus, Minus, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactions, useSettings, type Holding, type Transaction } from "@/lib/store";
import { fmtGBP, fmtPrice, fmtPct, fmtRelative, holdingCostGBP, holdingCurrency, holdingValueGBP, isListedSymbol, chartDateLabel, filterByRange, type MoneyHolding } from "@/lib/format";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { BrandIcon } from "@/components/BrandIcon";
import { ValueTimeChart, type ValueTimeChartDot, type ValueTimeChartRow } from "@/components/dashboard/ValueTimeChart";

type PriceRow = { date: string; price: number };

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

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

export function StockDetail({ holding, portfolioId, portfolioValue, portfolioName, color, onBack, onBuy, onSell, onAddToPortfolio }: { holding: Holding; portfolioId?: string | null; portfolioValue: number; portfolioName?: string; color: string; onBack: () => void; onBuy?: () => void; onSell?: () => void; onAddToPortfolio?: () => void }) {
  const { settings } = useSettings();
  const [range, setRange] = useState<ChartRange>("1Y");
  const rangeTouched = useRef(false);
  useEffect(() => {
    if (rangeTouched.current) return;
    setRange(settings.defaultRange);
  }, [settings.defaultRange]);
  const pickRange = (r: ChartRange) => {
    rangeTouched.current = true;
    setRange(r);
  };
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
    fetch(`/api/snapshots?holdingId=${encodeURIComponent(holding.id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const j = await r.json();
        const rows = (j.byHolding?.[holding.id]?.data ?? []) as { date: string; value: number }[];
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

  const val = holdingValueGBP(holding as MoneyHolding, settings.fxRates);
  const cost = holdingCostGBP(holding as MoneyHolding, settings.fxRates);
  const currency = holdingCurrency(holding);
  const gain = val - cost;
  const pct = cost ? (gain / cost) * 100 : 0;
  const weightPct = portfolioValue > 0 ? (val / portfolioValue) * 100 : null;
  const latestMarketMove = prices && prices.length > 1 && prices.at(-2)!.price > 0
    ? { amount: prices.at(-1)!.price - prices.at(-2)!.price, percent: ((prices.at(-1)!.price / prices.at(-2)!.price) - 1) * 100, date: prices.at(-1)!.date }
    : null;
  const isManual = !isListed;
  const gainTone = gain >= 0 ? "text-emerald-400" : "text-red-400";
  const moveTone = latestMarketMove ? (latestMarketMove.amount >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-600";
  const chartTitle = hasValueSeries ? "Value over time" : "Market price";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} currency={holding.currency} size={32} shape="circle" />
            <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">{holding.symbol}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="text-xs text-zinc-500">{holding.name}</p>
            {holding.exchange && (
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{holding.exchange}</span>
            )}
            {portfolioName && (
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{portfolioName}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBuy && onSell && (
            <>
              <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onBuy}><Plus className="h-3.5 w-3.5" /> Buy</Button>
              <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={onSell}><Minus className="h-3.5 w-3.5" /> Sell</Button>
            </>
          )}
          {!portfolioId && onAddToPortfolio && (
            <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={onAddToPortfolio} title="Move this holding into a portfolio"><FolderPlus className="h-3.5 w-3.5" /> Add to portfolio</Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={onBack}>← Back</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:gap-0 lg:py-7">
        <div className="col-span-2 lg:col-span-1 lg:pr-6">
          <p className={LABEL}>Value</p>
          <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">{fmtGBP(val)}</p>
          <p className={SUB}>Cost basis {fmtGBP(cost)}{weightPct == null ? "" : ` · ${weightPct.toFixed(1)}% weight`}</p>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:px-6">
          <p className={LABEL}>Unrealized gain</p>
          <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${gainTone}`}>
            <span className="whitespace-nowrap">{gain >= 0 ? "+" : ""}{fmtGBP(gain)}</span>
            <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(pct)}</span>
          </p>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:px-6">
          <p className={LABEL}>Price</p>
          <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">{fmtPrice(holding.currentPrice, currency)}</p>
          <p className={SUB}>{currency} · updated {fmtRelative(holding.lastRefreshedAt, settings.dateFormat)}</p>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:px-6">
          <p className={LABEL}>Shares</p>
          <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">{holding.shares}</p>
          <p className={SUB}>Avg {fmtPrice(holding.avgPrice, currency)}</p>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:pl-6">
          <p className={LABEL}>Latest move</p>
          <p className={`mt-2 whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${moveTone}`}>
            {latestMarketMove ? `${latestMarketMove.amount >= 0 ? "+" : "−"}${fmtPrice(Math.abs(latestMarketMove.amount), currency)}` : "—"}
          </p>
          <p className={SUB}>{latestMarketMove ? `${fmtPct(latestMarketMove.percent)} · ${shortDate(latestMarketMove.date, settings.dateFormat)}` : "No recent quote history"}</p>
        </div>
      </div>

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
          <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
            <h2 id="holding-trades-heading" className="text-sm font-medium text-white">Trades</h2>
            <span className="text-[11px] text-zinc-600">{transactions.length ? `${transactions.length} recorded` : "None yet"}</span>
          </div>
          {transactions.length === 0 ? (
            <p className="border-b border-white/[0.06] py-6 text-sm text-zinc-500">Buy or sell this holding to start a trade history.</p>
          ) : (
            <div className="max-h-[360px] divide-y divide-white/[0.05] overflow-auto">
              {transactions.slice(0, 50).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-1 py-3 transition-colors hover:bg-white/[0.025]">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${t.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{t.type === "buy" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                      <span className={t.type === "buy" ? "text-emerald-400" : "text-red-400"}>{t.type === "buy" ? "Buy" : "Sell"}</span>
                      <span className="tabular-nums text-zinc-500">{t.shares} @ {fmtPrice(t.price, currency)}</span>
                    </div>
                  </div>
                  <span className="hidden shrink-0 text-xs tabular-nums text-zinc-500 sm:block">{fmtPrice(t.shares * Number(t.price), currency)}</span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-600">{new Date(t.date).toLocaleDateString(settings.dateFormat, { month: "short", day: "numeric" })}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

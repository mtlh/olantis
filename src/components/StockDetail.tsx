"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceDot } from "recharts";
import { History, ArrowUpRight, ArrowDownRight, Wallet, Plus, Minus, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTransactions, useSettings, type Holding, type Transaction } from "@/lib/store";
import { fmtGBP, fmtPrice, fmtPct, fmtRelative, holdingValueGBP, holdingCostGBP, isListedSymbol, chartDateLabel, gbpAxisFormatter, priceAxisFormatter, paddedDomain, numericValues, filterByRange, type MoneyHolding } from "@/lib/format";
import { useChartZoom, ZoomSelectionArea, ZoomResetButton } from "@/components/ChartZoom";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

type PriceRow = { date: string; price: number };

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
  const chartData = useMemo(() => {
    if (hasValueSeries) return (snapSeries ?? []).map((p) => ({ date: chartDateLabel(p.date), price: p.price }));
    return (prices ?? []).map((p) => ({ date: chartDateLabel(p.date), price: p.price }));
  }, [hasValueSeries, snapSeries, prices]);
  const loading = !hasValueSeries && isListed && prices === null;

  const dots = useMemo(() => {
    if (!chartData.length) return [];
    const map = new Map(chartData.map((d) => [d.date, d.price]));
    return transactions
      .map((t: Transaction) => {
        const key = chartDateLabel(t.date);
        const y = map.get(key);
        if (y == null) return null;
        return { x: key, y, type: t.type, date: t.date, symbol: t.symbol };
      })
      .filter((x): x is { x: string; y: number; type: "buy" | "sell"; date: string; symbol: string } => x !== null);
  }, [chartData, transactions]);

  const chartZoom = useChartZoom(chartData);
  const axisValues = useMemo(() => numericValues(chartZoom.visible), [chartZoom.visible]);
  const axisFmt = useMemo(
    () => (hasValueSeries ? gbpAxisFormatter(axisValues) : priceAxisFormatter(axisValues, holding.currency)),
    [hasValueSeries, axisValues, holding.currency]
  );
  const yDomain = useMemo(() => paddedDomain(axisValues), [axisValues]);

  // Trade markers honour the user's "Show trade markers on charts" preference.
  const shownDots = useMemo(() => (settings.showTradeMarkers ? dots : []), [settings.showTradeMarkers, dots]);
  // Markers outside the zoomed period would land outside the X domain, so filter them too.
  const visibleDots = useMemo(() => {
    const dates = new Set(chartZoom.visible.map((d) => d.date));
    return shownDots.filter((d) => dates.has(d.x));
  }, [shownDots, chartZoom.visible]);

  const val = holdingValueGBP(holding as MoneyHolding, settings.fxRates);
  const cost = holdingCostGBP(holding as MoneyHolding, settings.fxRates);
  const gain = val - cost;
  const pct = cost ? (gain / cost) * 100 : 0;
  const weightPct = portfolioValue > 0 ? (val / portfolioValue) * 100 : null;
  const latestMarketMove = prices && prices.length > 1 && prices.at(-2)!.price > 0
    ? { amount: prices.at(-1)!.price - prices.at(-2)!.price, percent: ((prices.at(-1)!.price / prices.at(-2)!.price) - 1) * 100, date: prices.at(-1)!.date }
    : null;
  const isManual = !isListed;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border p-6 md:p-8" style={{ borderColor: color + "40", background: `linear-gradient(to bottom right, ${color}2A, ${color}12)` }}>
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full blur-3xl" style={{ background: color + "26" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-12 h-12 rounded-xl grid place-items-center font-bold text-sm bg-white/10 border border-white/10 text-white">{holding.symbol.slice(0, 3)}</div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">{holding.symbol}</h1>
              {holding.exchange && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300">{holding.exchange}</Badge>}
              {portfolioName && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">{portfolioName}</Badge>}
            </div>
            <p className="text-sm mt-2 text-zinc-500">{holding.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBuy && onSell && (
              <>
                <Button variant="outline" className="bg-white/5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={onBuy}><Plus className="w-4 h-4" /> Buy</Button>
                <Button variant="outline" className="bg-white/5 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={onSell}><Minus className="w-4 h-4" /> Sell</Button>
              </>
            )}
            {!portfolioId && onAddToPortfolio && (
              <Button variant="outline" size="sm" className="bg-white/5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 self-center" onClick={onAddToPortfolio} title="Move this holding into a portfolio"><FolderPlus className="w-4 h-4" /> Add to portfolio</Button>
            )}
            <Button variant="outline" className="bg-white/5 border-white/10" onClick={onBack}>← Back{portfolioName ? ` to ${portfolioName}` : ""}</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-8 md:grid-cols-3 2xl:grid-cols-5">
          <div className="p-4 rounded-xl bg-white text-black border-l-4" style={{ borderLeftColor: color }}>
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Value</div>
            <div className="text-2xl font-bold mt-1">{fmtGBP(val)}</div>
            <div className="text-xs text-zinc-600 mt-1">Cost {fmtGBP(cost)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Unrealized gain</div>
            <div className="text-2xl font-bold flex items-center gap-2" style={{ color: gain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(gain)} <span className="text-sm">{fmtPct(pct)}</span></div>
            <div className="text-xs text-zinc-500 mt-1">Current position only</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Shares</div>
            <div className="text-2xl font-bold text-white">{holding.shares}</div>
            <div className="text-xs text-zinc-500 mt-1">Avg {fmtPrice(holding.avgPrice, holding.currency)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Price</div>
            <div className="text-2xl font-bold text-white">{fmtPrice(holding.currentPrice, holding.currency)}</div>
            <div className="text-xs text-zinc-500 mt-1">{holding.currency} · updated {fmtRelative(holding.lastRefreshedAt, settings.dateFormat)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Parent weight</div>
            <div className="text-2xl font-bold text-white">{weightPct == null ? "—" : `${weightPct.toFixed(1)}%`}</div>
            <div className="text-xs text-zinc-500 mt-1">{portfolioName ?? "Total tracked"} · {fmtGBP(portfolioValue)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
            <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Latest market move</div>
            {latestMarketMove ? <>
              <div className="text-2xl font-bold" style={{ color: latestMarketMove.amount >= 0 ? "#34d399" : "#f87171" }}>{latestMarketMove.amount >= 0 ? "+" : "−"}{fmtPrice(Math.abs(latestMarketMove.amount), holding.currency)}</div>
              <div className="text-xs text-zinc-500 mt-1">{fmtPct(latestMarketMove.percent)} · {latestMarketMove.date}</div>
            </> : <div className="text-sm text-zinc-500 mt-1">No recent quote history</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white">{hasValueSeries ? "Value over time" : "Performance"}</CardTitle>
              <CardDescription>{hasValueSeries ? "Tracked position value" : "Market price"} • {chartData.length} points • {holding.symbol}{dots.length ? ` • ${dots.length} trades` : ""}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <ChartRangeSelector range={range} onRangeChange={pickRange} />
              {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
            </div>
          </CardHeader>
          <CardContent>
            {isManual && !hasValueSeries ? (
              <div className="h-[320px] grid place-items-center text-center">
                <div>
                  <Wallet className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">Manual holding — no market price history</p>
                  <p className="text-xs text-zinc-600 mt-1">Value tracked on the portfolio chart.</p>
                </div>
              </div>
            ) : loading ? (
              <div className="h-[320px] grid place-items-center text-sm text-zinc-500">Loading price history…</div>
            ) : chartData.length === 0 ? (
              <div className="h-[320px] grid place-items-center text-sm text-zinc-500">No price data available for {holding.symbol}.</div>
            ) : (
              <div className="h-[320px] select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                    <YAxis domain={yDomain ?? ["auto", "auto"]} tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v) => (hasValueSeries ? fmtGBP(Number(v)) : fmtPrice(Number(v), holding.currency))} />
                    <Area type="monotone" dataKey="price" name={holding.symbol} stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2.5} dot={false} />
                    {visibleDots.map((d) => (
                      <ReferenceDot key={`${d.date}-${d.symbol}-${d.x}`} x={d.x} y={d.y} r={5} fill={d.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {shownDots.length > 0 && !isManual && <div className="flex gap-3 mt-2 text-xs"><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span><span className="text-zinc-600">Trades marked on chart</span></div>}
          </CardContent>
        </Card>
        <Card className="glass-card overflow-hidden">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="flex items-center gap-2 text-white"><History className="w-4 h-4" /> Trades {transactions.length ? <Badge variant="outline" className="border-white/10 text-zinc-500">{transactions.length}</Badge> : null}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-zinc-400">No trades for {holding.symbol}</p>
                <p className="text-xs text-zinc-600 mt-1">Record buys and sells to build your history.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[400px] overflow-auto">
                {transactions.slice(0, 50).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                    <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${t.type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{t.type === "buy" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white font-medium">{t.type === "buy" ? "Buy" : "Sell"} • {t.shares} @ {fmtPrice(t.price, holding.currency)}</div>
                    </div>
                    <span className="text-xs text-zinc-600 tabular-nums">{new Date(t.date).toLocaleDateString(settings.dateFormat, { month: "short", day: "numeric" })}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

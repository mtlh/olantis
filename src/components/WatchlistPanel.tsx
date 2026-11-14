"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Maximize2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { chartDateLabel, fmtPct, fmtPrice } from "@/lib/format";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { BrandIcon } from "@/components/BrandIcon";

type WatchItem = { id: string; symbol: string; name: string; exchange: string | null; currency: string | null };
type Quote = { price: number; currency: string };
type SearchResult = {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
  price?: number | null;
  currency?: string | null;
};
type PricePoint = { date: string; price: number };
type ChartPoint = PricePoint & { label: string };
function apiError(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

type PriceChartProps = {
  data: ChartPoint[];
  loading: boolean;
  symbol: string;
  currency: string | null | undefined;
  change: number | null;
  heightClassName: string;
};

// Shared by the inline card and the expanded dialog so both plots stay identical.
function PriceChart({ data, loading, symbol, currency, change, heightClassName }: PriceChartProps) {
  const gradientId = useId();
  const stroke = change == null || change >= 0 ? "#34d399" : "#f87171";

  return (
    <div className={`${heightClassName} w-full`} role="img" aria-label={`${symbol} price chart`}>
      {loading ? (
        <div className="grid h-full place-items-center text-xs text-zinc-500">Loading price history…</div>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.24} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(value: number) => fmtPrice(value, currency)} width={64} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 12 }} labelStyle={{ color: "#a1a1aa", marginBottom: 4 }} formatter={(value) => fmtPrice(Number(value), currency)} />
            <Area type="monotone" dataKey="price" name={symbol} stroke={stroke} fill={`url(#${gradientId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="grid h-full place-items-center px-6 text-center text-xs text-zinc-500">No price history is available for {symbol}.</div>
      )}
    </div>
  );
}

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [symbol, setSymbol] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [range, setRange] = useState<ChartRange>("1M");
  const [chart, setChart] = useState<PricePoint[]>([]);
  const [loadedChartKey, setLoadedChartKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/watchlist");
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(apiError(data, "Could not load watchlist"));
    const nextItems = Array.isArray(data) ? (data as WatchItem[]) : [];
    setItems(nextItems);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist")
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(data, "Could not load watchlist"));
        if (!cancelled) {
          setItems(Array.isArray(data) ? (data as WatchItem[]) : []);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load watchlist");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const refreshQuotes = useCallback(async () => {
    if (!items.length) return;
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: items.map((item) => ({ symbol: item.symbol, exchange: item.exchange ?? undefined })) }),
    });
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(apiError(data, "Could not refresh prices"));
    setQuotes(data && typeof data === "object" ? data as Record<string, Quote> : {});
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    if (!items.length) return;
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: items.map((item) => ({ symbol: item.symbol, exchange: item.exchange ?? undefined })) }),
    })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(data, "Could not load prices"));
        if (!cancelled) setQuotes(data && typeof data === "object" ? data as Record<string, Quote> : {});
      })
      .catch(() => { if (!cancelled) setQuotes({}); });
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    const query = symbol.trim();
    if (!query) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(async (response) => response.ok ? await response.json() as SearchResult[] : [])
        .then((data) => {
          if (!cancelled) {
            const existing = new Set(items.map((item) => item.symbol.toUpperCase()));
            setSuggestions(Array.isArray(data) ? data.filter((result) => !existing.has(result.symbol.toUpperCase())) : []);
          }
        })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [items, symbol]);

  const activeItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const activeSymbol = activeItem?.symbol;
  const activeExchange = activeItem?.exchange;
  const activeChartKey = activeItem ? `${activeItem.id}:${range}` : "";
  const chartLoading = !!activeChartKey && loadedChartKey !== activeChartKey;
  const activeQuote = activeItem
    ? quotes[`${activeItem.symbol.toUpperCase()}:${(activeItem.exchange ?? "").toUpperCase()}`] ?? quotes[activeItem.symbol.toUpperCase()] ?? quotes[activeItem.symbol]
    : undefined;
  const pricedCount = items.filter((item) => {
    const quote = quotes[`${item.symbol.toUpperCase()}:${(item.exchange ?? "").toUpperCase()}`] ?? quotes[item.symbol.toUpperCase()] ?? quotes[item.symbol];
    return quote?.price != null;
  }).length;
  const firstPrice = chart[0]?.price;
  const lastPrice = activeQuote?.price ?? chart.at(-1)?.price;
  const chartChange = firstPrice != null && lastPrice != null && firstPrice !== 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;
  const chartData = useMemo(() => chart.map((point) => ({ ...point, label: chartDateLabel(point.date) })), [chart]);
  const displayPrice = activeQuote?.price ?? chart.at(-1)?.price;

  useEffect(() => {
    if (!activeChartKey || !activeSymbol) return;
    let cancelled = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(activeSymbol)}&exchange=${encodeURIComponent(activeExchange ?? "")}&range=${range}`)
      .then(async (response) => {
        const data: unknown = response.ok ? await response.json() : null;
        const rows = data && typeof data === "object" && "chart" in data && Array.isArray(data.chart)
          ? data.chart as PricePoint[]
          : [];
        if (!cancelled) {
          setChart(rows);
          setLoadedChartKey(activeChartKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChart([]);
          setLoadedChartKey(activeChartKey);
        }
      });
    return () => { cancelled = true; };
  }, [activeChartKey, activeSymbol, activeExchange, range]);

  const add = async (result?: SearchResult) => {
    const ticker = (result?.symbol ?? symbol).trim().toUpperCase();
    if (!ticker) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: ticker,
          name: result?.name,
          exchange: result?.exchange,
          currency: result?.currency,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(data, "Could not add symbol"));
      if (data && typeof data === "object" && "id" in data && typeof data.id === "string") setSelectedId(data.id);
      setSymbol("");
      setSuggestions([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const item = items.find((watchItem) => watchItem.id === id);
    setRemovingId(id);
    setError("");
    try {
      const response = await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data: unknown = response.ok ? null : await response.json();
      if (!response.ok) throw new Error(apiError(data, "Could not remove symbol"));
      setItems((current) => current.filter((watchItem) => watchItem.id !== id));
      setQuotes((current) => {
        if (!item) return current;
        const next = { ...current };
        delete next[item.symbol.toUpperCase()];
        delete next[`${item.symbol.toUpperCase()}:${(item.exchange ?? "").toUpperCase()}`];
        return next;
      });
      if (selectedId === id) setSelectedId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRemovingId("");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await Promise.all([load(), refreshQuotes()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh watchlist");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-0 lg:py-7">
          {[1, 2, 3].map((index) => (
            <div key={index} className={index === 1 ? "col-span-2 lg:col-span-1 lg:pr-8" : "lg:border-l lg:border-white/[0.06] lg:px-8"}>
              <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.07]" />
              <div className={`mt-2 animate-pulse rounded bg-white/[0.09] ${index === 1 ? "h-[38px] w-28 sm:h-[42px]" : "h-7 w-16 sm:h-8"}`} />
              <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-0 lg:py-7">
          <div className="col-span-2 lg:col-span-1 lg:pr-8">
            <p className={LABEL}>{activeSymbol ? `${activeSymbol} · ${range}` : "Selected"}</p>
            <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">
              {displayPrice == null ? "—" : fmtPrice(displayPrice, activeQuote?.currency ?? activeItem?.currency)}
            </p>
            <p className={SUB}>
              {chartChange == null ? (
                "No price history yet"
              ) : (
                <>
                  <span className={chartChange >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(chartChange)}</span>
                  {chart[0]?.date && <span> since {chartDateLabel(chart[0].date)}</span>}
                </>
              )}
            </p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Tracking</p>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">{items.length}</p>
            <p className={SUB}>{items.length === 1 ? "symbol" : "symbols"}</p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Live prices</p>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">
              {pricedCount}
              <span className="ml-1.5 text-[11px] font-normal text-zinc-500 sm:text-xs">of {items.length}</span>
            </p>
            <p className={SUB}>{pricedCount === items.length ? "All up to date" : "Awaiting quotes"}</p>
          </div>
        </div>
      ) : null}

      <div className={`grid grid-cols-1 gap-8 ${activeItem ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-0" : ""}`}>
        <section className="min-w-0 xl:pr-8" aria-labelledby="watchlist-symbols-heading">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <h2 id="watchlist-symbols-heading" className="text-sm font-medium text-white">Symbols</h2>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <form className="relative flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(suggestions[0]); }}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                aria-label="Search symbols to add"
                aria-autocomplete="list"
                placeholder="Search a company or ticker"
                className="pl-9 pr-9"
                value={symbol}
                onChange={(event) => { setSymbol(event.target.value); setSuggestions([]); }}
                maxLength={50}
                autoComplete="off"
              />
              {symbol && <button type="button" onClick={() => { setSymbol(""); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" aria-label="Clear search"><X className="size-4" /></button>}
              {suggestions.length > 0 && symbol.trim() && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl">
                  {suggestions.slice(0, 5).map((result) => (
                    <button key={`${result.symbol}:${result.exchange ?? ""}`} type="button" onClick={() => void add(result)} disabled={saving} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06] disabled:opacity-50">
                      <BrandIcon symbol={result.symbol} name={result.name} exchange={result.exchange} currency={result.currency} size={36} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{result.name}</span><span className="block truncate text-xs text-zinc-500">{result.symbol}{result.exchange ? ` · ${result.exchange}` : ""}{result.type ? ` · ${result.type}` : ""}</span></span>
                      {result.price != null && <span className="text-sm tabular-nums text-zinc-300">{fmtPrice(result.price, result.currency)}</span>}
                      <Plus className="size-4 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" size="icon" disabled={saving || !symbol.trim()} aria-label="Add symbol"><Plus className="size-4" /></Button>
          </form>

          {error && <p role="alert" className="mt-3 border-l-2 border-amber-500/50 pl-3 py-0.5 text-xs text-amber-300">{error}</p>}

          {loading ? (
            <div className="mt-4 border-t border-white/[0.06]" aria-label="Loading watchlist">
              {[1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-3 border-b border-white/[0.05] px-1 py-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.04]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-white/[0.05]" />
                    <div className="mt-1 h-2.5 w-20 animate-pulse rounded bg-white/[0.04]" />
                  </div>
                  <div className="h-3.5 w-16 animate-pulse rounded bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4 border-t border-white/[0.06] py-14 text-center">
              <p className="text-sm text-zinc-400">Nothing on your watchlist yet</p>
              <p className="mt-1 text-xs text-zinc-600">Search above to follow a company’s market price.</p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_24px] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                <span>Company</span><span className="text-right">Price</span><span />
              </div>
              <div className="divide-y divide-white/[0.05]">
                {items.map((item) => {
                  const quote = quotes[`${item.symbol.toUpperCase()}:${(item.exchange ?? "").toUpperCase()}`] ?? quotes[item.symbol.toUpperCase()] ?? quotes[item.symbol];
                  const isActive = activeItem?.id === item.id;
                  return (
                    <div key={item.id} className={`group grid grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-3 px-1 py-3 transition-colors ${isActive ? "bg-white/[0.045]" : "hover:bg-white/[0.025]"}`}>
                      <button type="button" onClick={() => setSelectedId(item.id)} className="flex min-w-0 items-center gap-3 text-left" aria-pressed={isActive}>
                        <BrandIcon symbol={item.symbol} name={item.name} exchange={item.exchange} currency={item.currency ?? quote?.currency} size={36} />
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{item.name || item.symbol}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-600">{item.symbol}{item.exchange ? ` · ${item.exchange}` : ""}</span></span>
                      </button>
                      <span className="text-right text-sm tabular-nums text-zinc-200">{quote?.price != null ? fmtPrice(quote.price, quote.currency ?? item.currency) : <span className="text-zinc-600">—</span>}</span>
                      <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 opacity-70 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => void remove(item.id)} disabled={removingId === item.id} aria-label={`Remove ${item.symbol}`}><Trash2 className="size-3.5" /></Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {activeItem && (
          <section className="min-w-0 xl:border-l xl:border-white/[0.06] xl:pl-8">
            <Card className="panel">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm font-medium text-white">{activeItem.name || activeItem.symbol}</CardTitle>
                  <p className="mt-1 truncate text-[11px] text-zinc-600">{activeItem.symbol}{activeItem.exchange ? ` · ${activeItem.exchange}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ChartRangeSelector range={range} onRangeChange={setRange} segmented />
                  <button type="button" onClick={() => setExpanded(true)} aria-label="Expand chart" className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <PriceChart
                  data={chartData}
                  loading={chartLoading}
                  symbol={activeItem.symbol}
                  currency={activeQuote?.currency ?? activeItem.currency}
                  change={chartChange}
                  heightClassName="h-[280px] sm:h-[340px] xl:h-[360px]"
                />
              </CardContent>
            </Card>
          </section>
        )}
      </div>

      {activeItem && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          {/* Same focus treatment as the dashboard chart: a pointer-opened
              dialog skips focus so the plot does not show a focus ring. */}
          <DialogContent
            className="max-w-[95vw] sm:max-w-[95vw]"
            initialFocus={(openType) => openType === "keyboard"}
          >
            <DialogHeader className="flex-row items-center justify-between gap-3 pr-10">
              <div className="min-w-0">
                <DialogTitle className="truncate">{activeItem.name || activeItem.symbol}</DialogTitle>
                <p className="mt-1 truncate text-[11px] text-zinc-600">{activeItem.symbol}{activeItem.exchange ? ` · ${activeItem.exchange}` : ""}</p>
              </div>
              <ChartRangeSelector range={range} onRangeChange={setRange} segmented />
            </DialogHeader>
            <PriceChart
              data={chartData}
              loading={chartLoading}
              symbol={activeItem.symbol}
              currency={activeQuote?.currency ?? activeItem.currency}
              change={chartChange}
              heightClassName="h-[70vh]"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { chartDateLabel, fmtPct, fmtPrice } from "@/lib/format";

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
type ChartRange = "1M" | "3M" | "1Y" | "MAX";

const CHART_RANGES: ChartRange[] = ["1M", "3M", "1Y", "MAX"];

function apiError(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid size-9 place-items-center rounded-xl bg-white/[0.06] text-zinc-300"><Eye className="size-4" /></div>
            <div><p className="text-xs text-zinc-500">Symbols tracked</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{loading ? "—" : items.length}</p></div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400"><Activity className="size-4" /></div>
            <div><p className="text-xs text-zinc-500">Live prices</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{loading ? "—" : `${pricedCount} / ${items.length}`}</p></div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid size-9 place-items-center rounded-xl bg-white/[0.06] text-zinc-300"><TrendingUp className="size-4" /></div>
            <div className="min-w-0"><p className="text-xs text-zinc-500">Selected</p><p className="mt-0.5 truncate text-lg font-semibold text-white">{activeItem?.symbol ?? "—"}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-white"><Eye className="size-4 text-zinc-500" /> Watchlist <Badge variant="outline" className="border-white/10 text-zinc-500">{items.length}</Badge></CardTitle>
              <CardDescription className="mt-1">Symbols you’re keeping an eye on.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="icon" className="border-white/10 bg-white/5" onClick={() => void handleRefresh()} disabled={refreshing} aria-label="Refresh watchlist">
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="relative flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(suggestions[0]); }}>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  aria-label="Search symbols to add"
                  aria-autocomplete="list"
                  placeholder="Search a company or ticker (e.g. NVIDIA, NVDA)"
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
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-xs font-semibold text-zinc-200">{result.symbol.slice(0, 4)}</span>
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

            {error && <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-300">{error}</p>}

            {loading ? (
              <div className="space-y-2 py-2" aria-label="Loading watchlist">
                {[1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse rounded-lg bg-white/[0.035]" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-xl bg-white/[0.05] text-zinc-400"><Search className="size-5" /></div>
                <h3 className="mt-3 text-sm font-medium text-white">Your watchlist is ready</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">Search for a company or ticker above to follow its market price and performance here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[500px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_36px] gap-3 border-b border-white/[0.06] px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                    <span>Company</span><span className="text-right">Price</span><span />
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {items.map((item) => {
                      const quote = quotes[`${item.symbol.toUpperCase()}:${(item.exchange ?? "").toUpperCase()}`] ?? quotes[item.symbol.toUpperCase()] ?? quotes[item.symbol];
                      const isActive = activeItem?.id === item.id;
                      return (
                        <div key={item.id} className={`group grid grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-3 rounded-lg px-3 py-3 transition ${isActive ? "bg-white/[0.055]" : "hover:bg-white/[0.025]"}`}>
                          <button type="button" onClick={() => setSelectedId(item.id)} className="flex min-w-0 items-center gap-3 text-left" aria-pressed={isActive}>
                            <span className={`grid size-9 shrink-0 place-items-center rounded-lg border text-[11px] font-semibold ${isActive ? "border-white/15 bg-white/10 text-white" : "border-white/[0.06] bg-white/[0.035] text-zinc-400"}`}>{item.symbol.slice(0, 3)}</span>
                            <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{item.name || item.symbol}</span><span className="mt-0.5 block truncate text-xs text-zinc-500">{item.symbol}{item.exchange ? ` · ${item.exchange}` : ""}</span></span>
                          </button>
                          <span className="text-right text-sm tabular-nums text-zinc-200">{quote?.price != null ? fmtPrice(quote.price, quote.currency ?? item.currency) : <span className="text-zinc-600">—</span>}</span>
                          <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 opacity-70 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => void remove(item.id)} disabled={removingId === item.id} aria-label={`Remove ${item.symbol}`}><Trash2 className="size-3.5" /></Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card min-h-[360px]">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-white">{activeItem ? `${activeItem.symbol} performance` : "Price performance"}</CardTitle>
              <CardDescription className="mt-1">{activeItem ? activeItem.name : "Select a symbol to explore its price history."}</CardDescription>
            </div>
            {activeItem && activeQuote?.price != null && <span className="shrink-0 text-sm font-medium tabular-nums text-white">{fmtPrice(activeQuote.price, activeQuote.currency ?? activeItem.currency)}</span>}
          </CardHeader>
          <CardContent>
            {activeItem ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className={`flex items-center gap-1.5 text-sm font-medium tabular-nums ${chartChange == null ? "text-zinc-500" : chartChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {chartChange == null ? <Activity className="size-3.5" /> : chartChange >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {chartChange == null ? "—" : `${fmtPct(chartChange)} over ${range}`}
                  </div>
                  <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.025] p-0.5">
                    {CHART_RANGES.map((chartRange) => <Button key={chartRange} type="button" variant={range === chartRange ? "secondary" : "ghost"} size="xs" className="h-6 px-2 text-[11px]" onClick={() => setRange(chartRange)}>{chartRange}</Button>)}
                  </div>
                </div>
                <div className="h-[230px] w-full">
                  {chartLoading ? (
                    <div className="grid h-full place-items-center text-xs text-zinc-500">Loading price history…</div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="watchlist-price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartChange == null || chartChange >= 0 ? "#34d399" : "#f87171"} stopOpacity={0.24} /><stop offset="95%" stopColor={chartChange == null || chartChange >= 0 ? "#34d399" : "#f87171"} stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.055)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} minTickGap={24} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(value: number) => fmtPrice(value, activeQuote?.currency ?? activeItem.currency)} width={64} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 12 }} labelStyle={{ color: "#a1a1aa", marginBottom: 4 }} formatter={(value) => fmtPrice(Number(value), activeQuote?.currency ?? activeItem.currency)} />
                        <Area type="monotone" dataKey="price" name={activeItem.symbol} stroke={chartChange == null || chartChange >= 0 ? "#34d399" : "#f87171"} fill="url(#watchlist-price-fill)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center px-6 text-center text-xs text-zinc-500">No price history is available for {activeItem.symbol}.</div>
                  )}
                </div>
                {chart.length > 0 && <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500"><span>{chart.length} market data points</span><span>{chart[0].date} — {chart.at(-1)?.date}</span></div>}
              </>
            ) : (
              <div className="grid min-h-[260px] place-items-center text-center">
                <div><div className="mx-auto grid size-11 place-items-center rounded-xl bg-white/[0.05] text-zinc-500"><TrendingDown className="size-5" /></div><p className="mt-3 text-sm text-zinc-400">Nothing to chart yet</p><p className="mt-1 text-xs text-zinc-600">Add a ticker to see its performance.</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

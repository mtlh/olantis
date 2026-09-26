"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtPrice } from "@/lib/format";

type WatchItem = { id: string; symbol: string; name: string; exchange: string | null; currency: string | null };
type Quote = { price: number; currency: string };

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/watchlist");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load watchlist");
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load watchlist");
      if (!cancelled) { setItems(Array.isArray(data) ? data : []); setLoading(false); }
    }).catch((e: unknown) => {
      if (!cancelled) { setError(e instanceof Error ? e.message : "Could not load watchlist"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: items.map((item) => ({ symbol: item.symbol, exchange: item.exchange ?? undefined })) }) })
      .then((response) => response.json())
      .then((data: Record<string, Quote>) => { if (!cancelled) setQuotes(data); })
      .catch(() => { if (!cancelled) setQuotes({}); });
    return () => { cancelled = true; };
  }, [items]);

  const add = async () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: ticker }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add symbol");
      setSymbol("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      const response = await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove symbol");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-white"><Eye className="w-4 h-4 text-zinc-500" /> Watchlist</CardTitle>
        <Badge variant="outline" className="border-white/10 text-zinc-500">{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <Input aria-label="Ticker symbol" placeholder="Add a symbol (e.g. NVDA)" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={12} />
          <Button type="submit" size="icon" disabled={saving || !symbol.trim()} aria-label="Add to watchlist"><Plus className="w-4 h-4" /></Button>
          <Button type="button" variant="outline" size="icon" className="bg-white/5 border-white/10" onClick={() => void load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))} aria-label="Refresh watchlist"><RefreshCw className="w-4 h-4" /></Button>
        </form>
        {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
        {loading ? <p className="py-4 text-center text-xs text-zinc-500">Loading watchlist…</p> : items.length === 0 ? <p className="py-4 text-center text-xs text-zinc-500">Track symbols here before adding them to a portfolio.</p> : (
          <div className="divide-y divide-white/5 max-h-64 overflow-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium text-white">{item.symbol}</div><div className="text-xs text-zinc-500 truncate">{item.name}</div></div>
                <span className="text-sm tabular-nums text-zinc-300">{quotes[item.symbol]?.price ? fmtPrice(quotes[item.symbol].price, quotes[item.symbol].currency) : "—"}</span>
                <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={() => void remove(item.id)} aria-label={`Remove ${item.symbol}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandIcon } from "@/components/BrandIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { Holding, Portfolio } from "@/lib/store";
import { fmtPrice, isListedSymbol, todayISODate } from "@/lib/format";

type SymbolResult = {
  symbol: string;
  name: string;
  exchange: string;
  exchDisp?: string;
  price?: number | null;
  currency?: string | null;
  longname?: string;
};

type HoldingForm = {
  symbol: string;
  name: string;
  shares: string;
  avgPrice: string;
  currentPrice: string;
  purchaseDate: string;
  exchange: string;
  currency: string;
  sector: string;
};

export type HoldingFormData = {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currency: string;
  sector: string | null;
  purchaseDate: string;
  exchange?: string;
};

type HoldingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolio: Portfolio | null;
  holding: Holding | null;
  defaultCurrency: string;
  onSave: (holdingId: string | null, data: HoldingFormData) => Promise<void>;
};

function createInitialForm(holding: Holding | null, currency: string): HoldingForm {
  return {
    symbol: holding?.symbol ?? "",
    name: holding?.name ?? "",
    shares: holding ? String(holding.shares) : "",
    avgPrice: holding ? String(holding.avgPrice) : "",
    currentPrice: holding ? String(holding.currentPrice) : "",
    purchaseDate: holding?.purchaseDate?.split("T")[0] ?? todayISODate(),
    exchange: holding?.exchange ?? "",
    currency: holding?.currency ?? currency,
    sector: holding?.sector ?? "",
  };
}

export function HoldingDialog({
  open,
  onOpenChange,
  portfolio,
  holding,
  defaultCurrency,
  onSave,
}: HoldingDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => createInitialForm(holding, defaultCurrency));
  const [isManual, setIsManual] = useState(
    () => portfolio?.type === "manual" || (!!holding && !isListedSymbol(holding.symbol)),
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState("");
  const [symbolResults, setSymbolResults] = useState<SymbolResult[]>([]);
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);

  const effectiveIsManual = portfolio?.type === "manual" || isManual;
  const updateForm = useCallback(<K extends keyof HoldingForm>(key: K, value: HoldingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const symbol = form.symbol.trim();
    const shares = Number(form.shares);
    const avgPrice = Number(form.avgPrice);
    const currentPrice = Number(form.currentPrice);

    if (!symbol) errors.symbol = effectiveIsManual ? "Name required" : "Symbol required";
    else if (effectiveIsManual && symbol.length > 40) errors.symbol = "1–40 characters";
    else if (!effectiveIsManual && !isListedSymbol(symbol)) errors.symbol = "Invalid symbol";

    if (!Number.isFinite(shares) || shares <= 0) errors.shares = "Shares must be > 0";
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) errors.avgPrice = "Price must be > 0";
    if (form.currentPrice && (!Number.isFinite(currentPrice) || currentPrice <= 0)) errors.currentPrice = "Must be > 0";
    if (!form.purchaseDate) errors.purchaseDate = "Date required";

    return errors;
  }, [effectiveIsManual, form]);

  useEffect(() => {
    const query = form.symbol.trim();
    if (!open || query.length < 2 || holding || effectiveIsManual) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSymbolSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data: unknown = response.ok ? await response.json() : [];
        if (!cancelled) {
          const results = Array.isArray(data) ? data as SymbolResult[] : [];
          setSymbolResults(results);
          setShowSymbolMenu(results.length > 0);
        }
      } catch {
        if (!cancelled) setSymbolResults([]);
      } finally {
        if (!cancelled) setSymbolSearching(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveIsManual, form.symbol, holding, open]);

  const fetchQuote = async (symbol: string, exchange = form.exchange) => {
    const ticker = symbol.trim();
    if (!ticker) return;

    setQuoteLoading(true);
    setQuoteInfo("");
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [{ symbol: ticker, exchange: exchange || undefined }] }),
      });
      if (!response.ok) throw new Error("Quote lookup failed");
      const data: unknown = await response.json();
      const quote = data && typeof data === "object"
        ? (data as Record<string, { price?: number; currency?: string }>)[ticker.toUpperCase()]
        : undefined;

      if (quote?.price) {
        updateForm("currentPrice", String(quote.price));
        updateForm("currency", quote.currency ?? form.currency);
        setQuoteInfo(`Live: ${fmtPrice(quote.price, quote.currency)} • ${quote.currency ?? ""}`);
      } else {
        setQuoteInfo("No live price found — enter manually");
      }
    } catch {
      setQuoteInfo("Quote lookup failed");
    } finally {
      setQuoteLoading(false);
    }
  };

  const selectSearchResult = (result: SymbolResult) => {
    const nextSymbol = result.symbol?.toUpperCase() ?? form.symbol;
    updateForm("symbol", nextSymbol);
    updateForm("name", result.name ?? result.longname ?? form.name);
    updateForm("exchange", result.exchange ?? form.exchange);
    if (result.price != null) updateForm("currentPrice", String(result.price));
    if (result.currency) updateForm("currency", result.currency);
    setShowSymbolMenu(false);
    setSymbolResults([]);

    if (result.price != null) {
      setQuoteInfo(`Yahoo: ${fmtPrice(result.price, result.currency)} • ${result.exchDisp ?? result.exchange}`);
    } else if (result.symbol) {
      void fetchQuote(result.symbol, result.exchange ?? form.exchange);
    }
  };

  const submit = async () => {
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }
    if (!portfolio) return;

    const symbol = form.symbol.trim().toUpperCase();
    const isDuplicate = !holding && portfolio.holdings.some((item) => item.symbol.toUpperCase() === symbol);
    if (isDuplicate) {
      setFormErrors({ symbol: "Already in this portfolio" });
      return;
    }

    setSaving(true);
    try {
      await onSave(holding?.id ?? null, {
        symbol,
        name: form.name.trim() || symbol,
        shares: Number(form.shares),
        avgPrice: Number(form.avgPrice),
        currentPrice: Number(form.currentPrice || form.avgPrice),
        currency: form.currency || "GBP",
        sector: form.sector.trim() || null,
        purchaseDate: form.purchaseDate,
        exchange: form.exchange || undefined,
      });
      toast({
        title: holding ? "Holding updated" : "Holding added",
        description: symbol,
        variant: "success",
      });
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Save failed", description: message, variant: "error" });
      setFormErrors((current) => ({ ...current, symbol: message }));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: string) => formErrors[field]
    ? <p className="text-xs text-red-400">{formErrors[field]}</p>
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {holding ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {holding ? "Edit holding" : "Add holding"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {portfolio?.type === "live" && (
            <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
              <Button type="button" variant={!effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={() => setIsManual(false)}>Listed</Button>
              <Button type="button" variant={effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={() => { setIsManual(true); setSymbolResults([]); setShowSymbolMenu(false); setSymbolSearching(false); }}>Cash / Manual</Button>
            </div>
          )}

          {effectiveIsManual ? (
            <>
              <div className="space-y-1.5">
                <Label>Holding name *</Label>
                <Input placeholder="e.g. Cash, Workplace Pension, Property" value={form.symbol} onChange={(event) => updateForm("symbol", event.target.value)} className={formErrors.symbol ? "border-red-500/50" : ""} />
                {fieldError("symbol")}
                <p className="text-xs text-zinc-600">Manual — free-form, counts toward totals &amp; charts. No ticker lookup.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input placeholder="e.g. Uninvested cash, Barclays savings" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                <div className="space-y-1.5 relative">
                  <Label>Symbol *</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        placeholder="AAPL or Apple"
                        value={form.symbol}
                        onChange={(event) => {
                          updateForm("symbol", event.target.value.toUpperCase());
                          setSymbolResults([]);
                          setShowSymbolMenu(false);
                          setSymbolSearching(false);
                        }}
                        onFocus={() => { if (symbolResults.length) setShowSymbolMenu(true); }}
                        onBlur={() => window.setTimeout(() => setShowSymbolMenu(false), 180)}
                        className={formErrors.symbol ? "border-red-500/50" : ""}
                        autoComplete="off"
                      />
                      {showSymbolMenu && symbolResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden max-h-64 overflow-auto">
                          {symbolResults.map((result) => (
                            <button key={`${result.symbol}:${result.exchange}`} type="button" onMouseDown={(event) => { event.preventDefault(); selectSearchResult(result); }} className="w-full text-left px-3 py-2.5 hover:bg-white/5 flex items-center justify-between gap-2 border-b border-white/[0.04] last:border-0">
                              <BrandIcon symbol={result.symbol} name={result.name} exchange={result.exchange} size={24} />
                              <span className="min-w-0">
                                <span className="text-sm font-medium text-white flex items-center gap-2">
                                  {result.symbol}
                                  <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-500">{result.exchange || result.exchDisp || "—"}</Badge>
                                  {result.price != null && <span className="text-xs text-emerald-400">{fmtPrice(result.price, result.currency)}</span>}
                                </span>
                                <span className="block text-xs text-zinc-500 truncate">{result.name}</span>
                              </span>
                              <Plus className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                            </button>
                          ))}
                          {symbolSearching && <div className="px-3 py-2 text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Searching Yahoo…</div>}
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 bg-white/5 border-white/10" onClick={() => void fetchQuote(form.symbol)} disabled={quoteLoading || !form.symbol.trim()} title="Fetch live price for this exchange">
                      {quoteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {fieldError("symbol")}
                  {quoteInfo && <p className="text-xs text-zinc-500">{quoteInfo}</p>}
                  {!holding && <p className="text-xs text-zinc-600">Type symbol or company name — Yahoo search</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Exchange</Label>
                  <Select value={form.exchange || "__auto"} onValueChange={(value) => updateForm("exchange", value === "__auto" ? "" : value ?? "")}>
                    <SelectTrigger className="h-10 bg-white/5 border-white/10"><span className="flex-1 text-left truncate text-sm">{form.exchange || "Auto"}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto">Auto — from symbol/search</SelectItem>
                      <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                      <SelectItem value="NYSE">NYSE</SelectItem>
                      <SelectItem value="AMEX">AMEX</SelectItem>
                      <SelectItem value="LSE">LSE (London)</SelectItem>
                      <SelectItem value="NYSEARCA">NYSEARCA</SelectItem>
                      <SelectItem value="OTC">OTC</SelectItem>
                      <SelectItem value="EPA">EPA (Paris)</SelectItem>
                      <SelectItem value="XETRA">XETRA</SelectItem>
                      <SelectItem value="TSE">TSE (Tokyo)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-600">Mapped to Yahoo: LSE → .L</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Apple Inc — auto-filled from Yahoo" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Sector / asset class</Label>
            <Input placeholder="e.g. Technology, Cash, Bonds, Property" maxLength={48} value={form.sector} onChange={(event) => updateForm("sector", event.target.value)} />
            <p className="text-xs text-zinc-600">Used to group this position in sector allocation.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{effectiveIsManual ? "Amount (£) *" : "Shares *"}</Label>
              <Input type="number" min="0" step="any" placeholder={effectiveIsManual ? "5000" : "10"} value={form.shares} onChange={(event) => updateForm("shares", event.target.value)} className={formErrors.shares ? "border-red-500/50" : ""} />
              {fieldError("shares")}
              {effectiveIsManual && <p className="text-xs text-zinc-600">Tip: use 1 share × price = total for cash</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{effectiveIsManual ? "Price (per unit) *" : "Avg price (cost) *"}</Label>
              <Input type="number" min="0" step="any" placeholder={effectiveIsManual ? "1.00" : "150.00"} value={form.avgPrice} onChange={(event) => updateForm("avgPrice", event.target.value)} className={formErrors.avgPrice ? "border-red-500/50" : ""} />
              {fieldError("avgPrice")}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Current price {effectiveIsManual ? "" : <span className="text-zinc-500 font-normal">(live)</span>}</Label>
              {effectiveIsManual ? (
                <Input type="number" min="0" step="any" placeholder="1.00" value={form.currentPrice} onChange={(event) => updateForm("currentPrice", event.target.value)} className={formErrors.currentPrice ? "border-red-500/50" : ""} />
              ) : (
                <div className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 flex items-center text-sm text-zinc-300">
                  {form.currentPrice ? fmtPrice(Number(form.currentPrice), form.currency) : "—"}
                  <span className="ml-auto text-xs text-zinc-600">read-only</span>
                </div>
              )}
              {fieldError("currentPrice")}
              <p className="text-xs text-zinc-600">{effectiveIsManual ? "Keep equal to avg for cash" : "Auto-filled from Yahoo; avg cost is what you paid"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Purchase date</Label>
              <Input type="date" value={form.purchaseDate} max={todayISODate()} onChange={(event) => updateForm("purchaseDate", event.target.value)} className={formErrors.purchaseDate ? "border-red-500/50" : ""} />
              {fieldError("purchaseDate")}
            </div>
          </div>

          {portfolio && (
            <div className="flex gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {effectiveIsManual
                ? "Manual holdings are excluded from price refresh and count toward portfolio value and charts."
                : "Live prices refresh daily at 06:00 UTC. Use 'Refresh prices' on dashboard for manual update (24h limit)."}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || !portfolio}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

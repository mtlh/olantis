"use client";
import { usePortfolios, useSnapshots, useAccounts, useTransactions, useProviders, useHoldings } from "@/lib/store";
import type { Holding, Portfolio, Account, Provider, Snapshot } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ReferenceDot } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Plus, Trash2, Pencil, Search, X, RefreshCw, Download, AlertTriangle, Check, Loader2, ShoppingCart, Minus, History, ArrowDownRight, ArrowUpRight, Briefcase } from "lucide-react";
import { TradeDialog } from "@/components/TradeDialog";
import { CreatePortfolioWizard } from "@/components/CreatePortfolioWizard";
import { StockDetail } from "@/components/StockDetail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

import { PALETTE, portfolioTint } from "@/lib/colors";
const CHART_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#fb7185", "#38bdf8", "#f97316"];
const PORTFOLIO_COLORS: Record<string, string> = { ISA: "#60a5fa", SIPP: "#34d399", GIA: "#f472b6" };
function fmtGBP(n: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n); }
function fmtPrice(n: number, currency?: string | null) {
  if (currency === "GBX" || currency === "GBp") return `${Math.round(n).toLocaleString("en-GB")}p`;
  if (currency === "GBP") return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n);
  if (currency === "USD") return `$${Number(n).toFixed(2)}`;
  if (currency === "EUR") return `€${Number(n).toFixed(2)}`;
  return `${Number(n).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}
function holdingValueGBP(h: Holding) { const raw = h.shares * h.currentPrice; if (h.currency === "GBX" || h.currency === "GBp") return raw / 100; return raw; }
function holdingCostGBP(h: Holding) { const raw = h.shares * h.avgPrice; if (h.currency === "GBX" || h.currency === "GBp") return raw / 100; return raw; }
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function fmtRelative(ts?: number | null) {
  if (!ts) return "never";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-GB");
}

type SymbolResult = { symbol: string; name: string; exchange: string; exchDisp?: string; price?: number | null; currency?: string | null; longname?: string; rawExchange?: string; type?: string };
type ChartDot = { x: string; y: number; type: "buy" | "sell"; symbol: string; date: string; shares: number; price: number };
type PortfolioUpdateBody = { id: string; name?: string; type?: string; accountId?: string | null; providerId?: string | null };
type AllocationItem = { name: string; value: number; color: string; pct: number };
type ChartRow = { date: string; total: number; [key: string]: string | number };

export function Dashboard({ isDemo }: { isDemo?: boolean }) {
  const { accounts, create: createAccount, remove: removeAccount, rename: renameAccount, ready: accountsReady } = useAccounts();

  const { providers, create: createProvider, remove: removeProvider, rename: renameProvider, refresh: refreshProviders } = useProviders();
  const { portfolios, create, remove, upsertHolding, deleteHolding, refresh: refreshPortfolios, ready: portfoliosReady } = usePortfolios();
  const { holdings: allHoldingsList, refresh: refreshAllHoldings } = useHoldings();
  const directHoldings = useMemo(()=> allHoldingsList.filter((h: Holding)=> !h.portfolioId), [allHoldingsList]);
  const { snapshots, byPortfolio } = useSnapshots(portfolios, directHoldings as Holding[]);
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tradeHolding, setTradeHolding] = useState<Holding | null>(null);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [showTrade, setShowTrade] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardAccountId, setWizardAccountId] = useState<string | null>(null);
  const [wizardProviderId, setWizardProviderId] = useState<string | null>(null);
  const [showHolding, setShowHolding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [range, setRange] = useState<"1M" | "3M" | "1Y" | "MAX">("1Y");
  const [allocMode, setAllocMode] = useState<"holding" | "account">("holding");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const active = useMemo(() => portfolios.find((p) => p.id === activeId) ?? null, [portfolios, activeId]);
  const [holdingViewId, setHoldingViewId] = useState<string | null>(null);
  const viewHolding = useMemo(() => {
    if (!holdingViewId) return null;
    const h = allHoldingsList.find((x: Holding) => x.id === holdingViewId) ?? null;
    if (!h) return null;
    if (h.portfolioId && activeId && h.portfolioId !== activeId) return null;
    return h;
  }, [holdingViewId, allHoldingsList, activeId]);
  const viewPortfolio = useMemo(() => (viewHolding ? portfolios.find((p) => p.id === viewHolding.portfolioId) ?? null : null), [viewHolding, portfolios]);
  const viewColor = useMemo(() => {
    if (!viewHolding) return "#60a5fa";
    const pf = viewPortfolio;
    const prov = viewHolding.providerId ? providers.find((pr) => pr.id === viewHolding.providerId) : undefined;
    const acc = viewHolding.accountId ? accounts.find((a) => a.id === viewHolding.accountId) : undefined;
    return pf?.color || prov?.color || acc?.color || "#60a5fa";
  }, [viewHolding, viewPortfolio, providers, accounts]);
  const prevPortfoliosRef = useRef<Portfolio[]>([]);
  useEffect(()=>{ if(prevPortfoliosRef.current !== portfolios && activeId && !portfolios.find(p=>p.id===activeId)) setActiveId(null); prevPortfoliosRef.current = portfolios; },[portfolios,activeId]);
  const activeBaseColor = useMemo(()=>{ if(!active) return null; const prov = providers.find(pr=> pr.id===active.providerId); const acc = accounts.find(a=> a.id===active.accountId); return active.color || prov?.color || acc?.color || "#60a5fa"; }, [active, providers, accounts]);
  const createDirectHolding = async (target: { accountId?: string | null; providerId?: string | null }, data: { symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; exchange?: string; purchaseDate?: string }) => {
    await fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, accountId: target.accountId ?? null, providerId: target.providerId ?? null }) }).then(async r=>{ if(!r.ok) throw new Error(await r.text()); });
    await refreshAllHoldings(); await refreshPortfolios();
  };
  const { transactions, refresh: refreshTx, create: createTx } = useTransactions(activeId);
  const overviewTx = useTransactions(null);
  const displayTx = activeId ? transactions : overviewTx.transactions;

  const openTrade = (h: Holding, type: "buy" | "sell") => { setTradeHolding(h); setTradeType(type); setShowTrade(true); };
  const handleTrade = async (data: { shares: number; price: number; date: string }) => {
    const pid = tradeHolding?.portfolioId ?? activeId;
    if (!pid || !tradeHolding) { toast({ title: "Cannot trade", description: "Direct stocks live outside portfolios — add them to a portfolio to record trades", variant: "error" }); return; }
    try {
      await createTx({ portfolioId: pid, holdingId: tradeHolding.id, type: tradeType, shares: data.shares, price: data.price, date: data.date });
      await refreshPortfolios();
      await refreshTx();
      await overviewTx.refresh();
      toast({ title: tradeType === "buy" ? "Buy recorded" : "Sell recorded", description: `${tradeType === "buy" ? "+" : "-"}${data.shares} ${tradeHolding.symbol} @ £${data.price}`, variant: "success" });
    } catch (e: unknown) { toast({ title: "Trade failed", description: e instanceof Error ? e.message : String(e), variant: "error" }); throw e; }
  };

  const { totalValue, totalCost, totalGain, totalGainPct } = useMemo(() => {
    const vPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h), 0), 0);
    const cPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingCostGBP(h), 0), 0);
    const vDirect = directHoldings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
    const cDirect = directHoldings.reduce((s, h: Holding) => s + holdingCostGBP(h), 0);
    const v = vPort + vDirect;
    const c = cPort + cDirect;
    return { totalValue: v, totalCost: c, totalGain: v - c, totalGainPct: c ? ((v - c) / c) * 100 : 0 };
  }, [portfolios, directHoldings]);

  const filteredSnapshots = useMemo(() => {
    const rangeCount: Record<string, number> = { "1M": 4, "3M": 13, "1Y": 52, MAX: 999 };
    const n = rangeCount[range];
    if (snapshots.length <= n) return snapshots;
    return snapshots.slice(-n);
  }, [snapshots, range]);

  const chartData = useMemo(() => {
    const rangeCount: Record<string, number> = { "1M": 4, "3M": 13, "1Y": 52, MAX: 999 };
    const n = rangeCount[range];
    const activeSeries = active ? ((byPortfolio[active.id]?.data ?? []) as Snapshot[]) : [];
    if (active) {
      const trimmed = activeSeries.length > n ? activeSeries.slice(-n) : activeSeries;
      if (trimmed.length === 0) {
        const today = new Date().toISOString().split("T")[0].slice(5);
        return [{ date: today, total: active.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0) }] as ChartRow[];
      }
      return trimmed.map((s) => ({ date: s.date.slice(5), total: s.value }));
    }
    if (filteredSnapshots.length === 0) {
      const today = new Date().toISOString().split("T")[0].slice(5);
      return [{ date: today, total: totalValue }] as ChartRow[];
    }
    const byPort = byPortfolio;
    const dates = filteredSnapshots.map((s) => s.date);
    return dates.map((d) => {
      const row: ChartRow = { date: d.slice(5), total: filteredSnapshots.find((s) => s.date === d)?.value ?? 0 };
      for (const [, info] of Object.entries(byPort)) {
        const v = info.data.find((x: Snapshot) => x.date === d)?.value;
        if (v != null) row[info.name] = v;
      }
      return row;
    });
  }, [filteredSnapshots, byPortfolio, totalValue, active, range]);

  const chartDots = useMemo(() => {
    if (!chartData.length) return [];
    const map = new Map(chartData.map((d) => [d.date, d.total]));
    return displayTx
      .map((t) => {
        const mmdd = t.date.slice(5);
        const y = map.get(mmdd);
        if (y == null) return null;
        return { x: mmdd, y, type: t.type, symbol: t.symbol, date: t.date, shares: t.shares, price: t.price };
      })
      .filter((x): x is ChartDot => x !== null);
  }, [displayTx, chartData]);

  const allocation = useMemo(() => {
    if (allocMode === "account") {
      const portTotal = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h), 0), 0);
      const directTotal = directHoldings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
      const total = portTotal + directTotal;
      if (!total) return [];
      if (accounts.length === 0) {
        return portfolios.map((p, i) => {
          const v = p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h), 0);
          const c = p.color || CHART_COLORS[i % CHART_COLORS.length];
          return { name: p.name, value: v, color: c, pct: (v / total) * 100 };
        }).sort((a,b)=> b.value - a.value);
      }
      const byAccount = new Map<string, number>();
      let unassignedVal = 0;
      for (const p of portfolios) {
        const v = p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h), 0);
        if (p.accountId) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? 0) + v);
        else unassignedVal += v;
      }
      for (const h of directHoldings) {
        const v = holdingValueGBP(h);
        if (h.accountId) byAccount.set(h.accountId, (byAccount.get(h.accountId) ?? 0) + v);
        else if (h.providerId) {
          const pr = providers.find(pp=> pp.id===h.providerId);
          if (pr?.accountId) byAccount.set(pr.accountId, (byAccount.get(pr.accountId) ?? 0) + v);
          else unassignedVal += v;
        } else unassignedVal += v;
      }
      const out: AllocationItem[] = accounts.map((acc, i) => {
        const fallback = PALETTE[i % PALETTE.length].value;
        const col = acc.color || fallback;
        return { name: acc.name, value: byAccount.get(acc.id) ?? 0, color: col, pct: ((byAccount.get(acc.id) ?? 0) / total) * 100 };
      }).filter((x) => x.value > 0);
      if (unassignedVal > 0) out.push({ name: "Unassigned", value: unassignedVal, color: "#71717a", pct: (unassignedVal / total) * 100 });
      return out.sort((a,b)=> b.value - a.value);
    }
    const portHoldings = active ? active.holdings : portfolios.flatMap((p) => p.holdings);
    const allHoldings = active ? portHoldings : [...portHoldings, ...directHoldings];
    const holdings = allHoldings;
    const total = holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
    if (!total) return [];
    if (active) {
      const prov = providers.find(pr=> pr.id===active.providerId);
      const acc = accounts.find(a=> a.id===active.accountId);
      const base = active.color || prov?.color || acc?.color || CHART_COLORS[0];
      const sorted = [...holdings].sort((a: Holding, b: Holding)=> holdingValueGBP(b) - holdingValueGBP(a));
      return sorted.map((h: Holding, i) => ({ name: h.symbol, value: holdingValueGBP(h), color: portfolioTint(base, i, sorted.length), pct: (holdingValueGBP(h) / total) * 100 }));
    }
      const sortedHoldings = [...holdings].sort((a: Holding, b: Holding)=> holdingValueGBP(b) - holdingValueGBP(a));
      return sortedHoldings.map((h: Holding, i) => {
      const parent = portfolios.find(p=> p.holdings.some(x=> x.id===h.id));
      let base: string | null = parent?.color || null;
      if (!base && h.providerId) base = (providers.find(pr=> pr.id===h.providerId) as Provider | undefined)?.color ?? null;
      if (!base && h.accountId) base = (accounts.find(a=> a.id===h.accountId) as Account | undefined)?.color ?? null;
      base = base || CHART_COLORS[i % CHART_COLORS.length];
      return { name: h.symbol, value: holdingValueGBP(h), color: portfolioTint(base, i, sortedHoldings.length), pct: (holdingValueGBP(h) / total) * 100 };
    });
  }, [active, portfolios, allocMode, accounts, providers, directHoldings]);

  const handleCreate = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    try { await create(name, type, accountId ?? null, providerId ?? null); toast({title:"Portfolio created",description:name,variant:"success"});} catch(e: unknown){toast({title:"Failed to create portfolio",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  };
  const handleCreateAccount = async (name: string) => {
    try { await createAccount(name); await refreshProviders(); } catch(e: unknown){ toast({title:"Failed",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  };
  const handleCreateProvider = async (name: string, accountId: string) => {
    try { await createProvider(name, accountId); toast({title:"Provider created",description:name,variant:"success"});} catch(e: unknown){toast({title:"Failed to create provider",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  };
  const handleRenameAccount = async (id:string,name:string)=>{ await renameAccount(id,name); await refreshPortfolios(); };
  const handleRenameProvider = async (id:string,name:string)=>{ await renameProvider(id,name); await refreshPortfolios(); };
  const handleRenamePortfolio = async (id:string,patch: { name?: string; type?: string; accountId?: string | null; providerId?: string | null })=>{ if(patch.accountId!==undefined || patch.providerId!==undefined || patch.name!==undefined || patch.type!==undefined){ const body: PortfolioUpdateBody={id}; if(patch.name!==undefined) body.name=patch.name; if(patch.type!==undefined) body.type=patch.type; if(patch.accountId!==undefined) body.accountId=patch.accountId; if(patch.providerId!==undefined) body.providerId=patch.providerId; await fetch("/api/portfolios",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(async r=>{ if(!r.ok) throw new Error(await r.text()); }); await refreshPortfolios(); } };
  const handleRemoveAccount = async (id: string) => {
    try { await removeAccount(id); await refreshProviders(); await refreshPortfolios(); toast({title:"Account deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };
  const handleRemoveProvider = async (id: string) => {
    try { await removeProvider(id); await refreshPortfolios(); toast({title:"Provider deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "gain" | "symbol">("value");
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0], exchange: "", currency: "GBP" });
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState<string>("");
  const [symbolResults, setSymbolResults] = useState<SymbolResult[]>([]);
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);

  const effectiveIsManual = active?.type === "manual" ? true : isManual;
  const validateHolding = useCallback(()=>{
    const e: Record<string,string>={};
    if (effectiveIsManual) {
      if(!form.symbol.trim()) e.symbol="Name required";
      else if(form.symbol.trim().length < 1 || form.symbol.trim().length > 40) e.symbol="1–40 characters";
    } else {
      if(!form.symbol.trim()) e.symbol="Symbol required";
      else if(!/^[A-Z0-9.\-]{1,12}$/i.test(form.symbol.trim())) e.symbol="Invalid symbol";
    }
    if(!form.shares || Number(form.shares)<=0) e.shares="Shares must be > 0";
    if(!form.avgPrice || Number(form.avgPrice)<=0) e.avgPrice="Price must be > 0";
    if(form.currentPrice && Number(form.currentPrice)<=0) e.currentPrice="Must be > 0";
    if(!form.purchaseDate) e.purchaseDate="Date required";
    return e;
  },[form, effectiveIsManual]);

  const prevSymbolRef = useRef<{ showHolding: boolean; editingId: string | null; effectiveIsManual: boolean }>({ showHolding: false, editingId: null, effectiveIsManual: false });
  useEffect(()=>{
    const q = form.symbol.trim();
    if (!showHolding || q.length <2 || editingId || effectiveIsManual) { if (prevSymbolRef.current.showHolding && !showHolding) { setSymbolResults([]); setShowSymbolMenu(false); } prevSymbolRef.current = { showHolding, editingId, effectiveIsManual }; return; }
    const t = setTimeout(async ()=>{
      setSymbolSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        const arr = Array.isArray(j) ? j : [];
        setSymbolResults(arr);
        setShowSymbolMenu(arr.length > 0);
      } catch { setSymbolResults([]); }
      finally { setSymbolSearching(false); }
    }, 320);
    return ()=> clearTimeout(t);
  }, [form.symbol, showHolding, editingId, effectiveIsManual]);

  const selectSearchResult = (r: SymbolResult) => {
    setForm(f=> ({ ...f, symbol: r.symbol?.toUpperCase() ?? f.symbol, name: r.name ?? r.longname ?? f.name, exchange: r.exchange ?? f.exchange, currentPrice: r.price != null ? String(r.price) : f.currentPrice, currency: r.currency ?? r.currency ?? f.currency }));
    setShowSymbolMenu(false);
    setSymbolResults([]);
    if (r.price != null) setQuoteInfo(`Yahoo: ${fmtPrice(r.price, r.currency)} • ${r.exchDisp ?? r.exchange}`);
    else if (r.symbol) fetchQuote(r.symbol);
  };

  const openAdd = () => { const manualDefault = active?.type === "manual"; setIsManual(manualDefault); setForm({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0], exchange: "", currency: "GBP" }); setEditingId(null); setFormErrors({}); setQuoteInfo(""); setShowSymbolMenu(false); setSymbolResults([]); setShowHolding(true); };
  const openEdit = (h: Holding) => { const manualDetected = active?.type === "manual" || !/^[A-Z0-9.\-]{1,12}$/i.test(h.symbol); setIsManual(manualDetected); setForm({ symbol: h.symbol, name: h.name, shares: String(h.shares), avgPrice: String(h.avgPrice), currentPrice: String(h.currentPrice), purchaseDate: h.purchaseDate?.split("T")[0] ?? new Date().toISOString().split("T")[0], exchange: h.exchange ?? "", currency: h.currency ?? "GBP" }); setEditingId(h.id); setFormErrors({}); setQuoteInfo(""); setShowSymbolMenu(false); setSymbolResults([]); setShowHolding(true); };

  const fetchQuote = async (sym:string)=>{
    if(!sym.trim() || sym.length<1) return;
    setQuoteLoading(true); setQuoteInfo("");
    try{
      const r = await fetch(`/api/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: [{ symbol: sym.trim(), exchange: form.exchange || undefined }] }) });
      const j = await r.json();
      const q = j[sym.trim().toUpperCase()];
      if(q?.price){ setForm(f=>({...f, currentPrice: String(q.price), currency: q.currency ?? f.currency })); setQuoteInfo(`Live: ${fmtPrice(q.price, q.currency)} • ${q.currency}`); }
      else setQuoteInfo("No live price found — enter manually");
    } catch{ setQuoteInfo("Quote lookup failed"); }
    finally{ setQuoteLoading(false); }
  };

  const submit = async () => {
    const errs = validateHolding();
    if(Object.keys(errs).length){ setFormErrors(errs); return; }
    if (!activeId) return;
    const dup = !editingId && active?.holdings.some(h=>h.symbol.toUpperCase()===form.symbol.toUpperCase().trim());
    if(dup){ setFormErrors({symbol:"Already in this portfolio"}); return; }
    setSaving(true);
    try {
      await upsertHolding(activeId, { id: editingId ?? undefined, symbol: form.symbol.toUpperCase().trim(), name: form.name?.trim() || form.symbol.toUpperCase().trim(), shares: Number(form.shares), avgPrice: Number(form.avgPrice), currentPrice: Number(form.currentPrice || form.avgPrice), currency: form.currency || "GBP", purchaseDate: form.purchaseDate, exchange: form.exchange || undefined });
      setShowHolding(false); toast({title: editingId?"Holding updated":"Holding added",description:form.symbol.toUpperCase(),variant:"success"});
    } catch(e: unknown){ toast({title:"Save failed",description:e instanceof Error ? e.message : String(e),variant:"error"}); setFormErrors({symbol: e instanceof Error ? e.message : String(e)}); }
    finally{ setSaving(false); }
  };

  const activeValue = active ? active.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0) : totalValue;
  const activeCost = active ? active.holdings.reduce((s, h: Holding) => s + holdingCostGBP(h), 0) : totalCost;
  const activeGain = activeValue - activeCost;
  const activeGainPct = activeCost ? (activeGain / activeCost) * 100 : 0;

  const filteredHoldings = useMemo(() => {
    if (!active) return [];
    let hs = active.holdings.filter((h) => !q || h.symbol.toLowerCase().includes(q.toLowerCase()) || h.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === "value") hs = [...hs].sort((a: Holding, b: Holding) => holdingValueGBP(b) - holdingValueGBP(a));
    else if (sort==="gain") hs = [...hs].sort((a: Holding, b: Holding) => (holdingValueGBP(b) - holdingCostGBP(b)) - (holdingValueGBP(a) - holdingCostGBP(a)));
    else hs = [...hs].sort((a,b)=> a.symbol.localeCompare(b.symbol));
    return hs;
  }, [active, q, sort]);

  const [confirmPortfolio, setConfirmPortfolio] = useState<null | typeof active>(null);
  const [confirmPortfolioInput, setConfirmPortfolioInput] = useState("");
  const [confirmAccount, setConfirmAccount] = useState<null | (typeof accounts)[number]>(null);
  const [confirmAccountInput, setConfirmAccountInput] = useState("");
  const [confirmProvider, setConfirmProvider] = useState<null | (typeof providers)[number]>(null);
  const [confirmProviderInput, setConfirmProviderInput] = useState("");
  const [confirmHolding, setConfirmHolding] = useState<null | { id: string; symbol: string }>(null);
  const [editPortfolioDialog, setEditPortfolioDialog] = useState<null | typeof active>(null);
  const [editPF, setEditPF] = useState({ name:"", type:"live" as "live"|"manual", accountId:"__none", providerId:"__none" });

  const openEditPortfolio = (p: Portfolio)=>{ setEditPortfolioDialog(p); setEditPF({name:p.name,type:p.type,accountId:p.accountId??"__none", providerId: p.providerId ?? "__none"}); };

  const saveEditPortfolio = async()=>{
    if(!editPortfolioDialog) return;
    if(editPF.name.trim().length<2) return toast({title:"Name too short",variant:"error"});
    setSaving(true);
    try{
      await handleRenamePortfolio(editPortfolioDialog.id,{name:editPF.name.trim(),type:editPF.type,accountId:editPF.accountId==="__none"?null:editPF.accountId, providerId: editPF.providerId==="__none"?null:editPF.providerId});
      setEditPortfolioDialog(null); toast({title:"Portfolio updated",variant:"success"});
    } catch(e: unknown){ toast({title:"Update failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
    finally{setSaving(false);}
  };

  const openWizard = (accountId: string | null = null, providerId: string | null = null) => {
    setWizardAccountId(accountId);
    setWizardProviderId(providerId);
    setShowWizard(true);
  };

  const refreshPrices = async()=>{
    if(portfolios.length===0) return;
    setRefreshing(true);
    try{
      const symbols = portfolios.flatMap(p=>p.holdings.filter((h: Holding)=> /^[A-Z0-9.\-]{1,12}$/i.test(h.symbol)).map(h=>({symbol:h.symbol,exchange:h.exchange})));
      if(!symbols.length) { toast({title:"No holdings to refresh",variant:"info"}); return; }
      const r = await fetch("/api/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols})});
      const quotes = await r.json();
      if(!Object.keys(quotes).length) { toast({title:"No prices returned",variant:"info"}); return; }
      const patch = await fetch("/api/holdings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols:quotes})});
      const j = await patch.json();
      if(!patch.ok){ toast({title:j.message||j.error||"Refresh limited",description:j.nextAllowedAt?`Next allowed ${new Date(j.nextAllowedAt*1000).toLocaleTimeString()}`:undefined,variant:"error"}); return; }
      await refreshPortfolios();
      toast({title:`Updated ${j.updated} holdings`,description:j.skipped?`${j.skipped} skipped (24h limit)`:undefined,variant:"success"});
    } catch(e: unknown){ toast({title:"Refresh failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
    finally{setRefreshing(false);}
  };

  const exportCsv = ()=>{
    if(!active) return;
    const rows = [["Symbol","Name","Shares","AvgPrice","CurrentPrice","Value","Gain","PurchaseDate"]];
    for(const h of active.holdings){ const v=holdingValueGBP(h), c=holdingCostGBP(h); rows.push([h.symbol,h.name,String(h.shares),String(h.avgPrice),String(h.currentPrice),String(v),String(v-c),h.purchaseDate]); }
    const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${active.name}-holdings.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleWizardCreate = async (name: string, type: "live" | "manual", accountId: string | null, providerId: string | null, extra?: { symbol?: string; shares?: string }) => {
    await handleCreate(name, type, accountId, providerId);
    if (extra?.symbol) {
      try {
        const res = await fetch("/api/portfolios");
        const list = await res.json();
        const created = list.find((p: Portfolio) => p.name === name);
        if (created?.id) {
          let price = 100;
          try{ const q = await fetch(`/api/quote?symbol=${encodeURIComponent(extra.symbol)}`).then(r=>r.json()); const hit=q[extra.symbol.toUpperCase()]; if(hit?.price) price=hit.price; } catch{}
          await fetch("/api/holdings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              portfolioId: created.id,
              symbol: extra.symbol.toUpperCase().trim(),
              name: extra.symbol.toUpperCase().trim(),
              shares: Number(extra.shares || 1),
              avgPrice: price,
              currentPrice: price,
              currency: "GBP",
              purchaseDate: new Date().toISOString().split("T")[0],
            }),
          });
          await refreshPortfolios();
        }
      } catch {}
    }
  };

  const isLoading = !portfoliosReady;

  return (
    <div className="flex min-h-screen">
      <Sidebar accounts={accounts} providers={providers} portfolios={portfolios} holdings={directHoldings} activeId={activeId} onSelect={(id) => { setActiveId(id); setHoldingViewId(null); }} onCreate={handleCreate} onCreateAccount={handleCreateAccount} onCreateProvider={handleCreateProvider} onOpenWizard={openWizard} onCreateDirectHolding={createDirectHolding} onRefresh={refreshAllHoldings} isDemo={isDemo} accountsReady={accountsReady} portfoliosReady={portfoliosReady} onRenameAccount={handleRenameAccount} onRenameProvider={handleRenameProvider} onRenamePortfolio={handleRenamePortfolio}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDeleteAccount={setConfirmAccount as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDeleteProvider={setConfirmProvider as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDeletePortfolio={setConfirmPortfolio as any} />
      <main className="flex-1 min-w-0 pt-12 md:pt-0">
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-8 space-y-6">
          {showWizard ? (
            <CreatePortfolioWizard open={showWizard} onOpenChange={setShowWizard} accounts={accounts} providers={providers} defaultAccountId={wizardAccountId} defaultProviderId={wizardProviderId}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onCreate={handleWizardCreate as any} inline />
          ) : viewHolding ? (() => {
            const prov = viewHolding.providerId ? providers.find((pr) => pr.id === viewHolding.providerId) : undefined;
            const acc = viewHolding.accountId ? accounts.find((a) => a.id === viewHolding.accountId) : undefined;
            return (
              <>
                <StockDetail holding={viewHolding} portfolioId={viewPortfolio?.id ?? null} portfolioName={viewPortfolio?.name ?? prov?.name ?? acc?.name} color={viewColor} onBack={() => setHoldingViewId(null)} onBuy={() => openTrade(viewHolding, "buy")} onSell={() => openTrade(viewHolding, "sell")} />
                <Dialog open={!!confirmHolding} onOpenChange={(o) => !o && setConfirmHolding(null)}>
                  <DialogContent className="bg-zinc-900 border-white/10 text-white">
                    <DialogHeader><DialogTitle>Delete holding</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-400">Delete <span className="text-white font-medium">{confirmHolding?.symbol}</span>? This cannot be undone.</p>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="ghost" onClick={() => setConfirmHolding(null)}>Cancel</Button>
                      <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" onClick={async () => { if (!confirmHolding) return; if (viewHolding.portfolioId) { await deleteHolding(viewHolding.portfolioId, confirmHolding.id); } else { await fetch(`/api/holdings?id=${confirmHolding.id}`, { method: "DELETE" }); await refreshAllHoldings(); } setConfirmHolding(null); setHoldingViewId(null); toast({ title: "Holding deleted", variant: "success" }); }}>Delete</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <TradeDialog open={showTrade} onOpenChange={setShowTrade} holding={tradeHolding} type={tradeType} onSubmit={handleTrade} />
              </>
            );
          })() : active ? (
            <>
              <div className="relative overflow-hidden rounded-2xl border p-6 md:p-8" style={{ borderColor: (activeBaseColor ?? "#60a5fa") + "40", background: `linear-gradient(to bottom right, ${(activeBaseColor ?? "#60a5fa")}2A, ${(activeBaseColor ?? "#60a5fa")}12)` }}>
                <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full blur-3xl" style={{ background: (activeBaseColor ?? "#60a5fa") + "26" }} />
                <div className="relative flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">{active.name}</h1>
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300 capitalize">{active.type}</Badge>
                      {active.accountId && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">{accounts.find((a) => a.id === active.accountId)?.name ?? ""}</Badge>}
                      {active.providerId && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-500">{providers.find((p) => p.id === active.providerId)?.name ?? ""}</Badge>}
                    </div>
                    <p className="text-sm mt-2 text-zinc-500">{active.holdings.length} holdings • {active.type} • updated {fmtRelative(Math.max(...active.holdings.map((h) => h.lastRefreshedAt ?? 0), 0) || null)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="bg-white/5 border-white/10" onClick={() => setActiveId(null)}>← Overview</Button>
                    <Button variant="outline" className="bg-white/5 border-white/10" onClick={()=>openEditPortfolio(active)}><Pencil className="w-4 h-4"/> Edit</Button>
                    <Button onClick={openAdd}><Plus className="w-4 h-4" /> Add holding</Button>
                    <Button variant="ghost" className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-white/5" onClick={() => { setConfirmPortfolio(active); setConfirmPortfolioInput(""); }}><Trash2 className="w-4 h-4" /> Delete</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="p-4 rounded-xl bg-white text-black border-l-4" style={{ borderLeftColor: activeBaseColor ?? "#60a5fa" }}>
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Value</div>
                    <div className="text-2xl font-bold mt-1">{fmtGBP(activeValue)}</div>
                    <div className="text-xs text-zinc-600 mt-1">Cost {fmtGBP(activeCost)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Return</div>
                    <div className="text-2xl font-bold flex items-center gap-2" style={{ color: activeGain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(activeGain)} <span className="text-sm">{fmtPct(activeGainPct)}</span></div>
                    <div className="text-xs text-zinc-500 mt-1">All time</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <Card className="xl:col-span-3 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Performance</CardTitle>
                      <CardDescription>{chartData.length} points • {active.name} {chartDots.length ? `• ${chartDots.length} trades` : ""}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {(["1M", "3M", "1Y", "MAX"] as const).map((r) => (
                        <Button key={r} variant={range === r ? "secondary" : "ghost"} size="xs" onClick={() => setRange(r)}>{r}</Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v) => fmtGBP(Number(v))} />
                          {(() => { const prov = providers.find(pr=> pr.id===active.providerId); const acc = accounts.find(a=> a.id===active.accountId); const col = active.color || prov?.color || acc?.color || "#60a5fa"; return <Area type="monotone" dataKey="total" name={active.name} stroke={col} fill={col} fillOpacity={0.14} strokeWidth={2.5} dot={false} />; })()}
                          {chartDots.map((d: ChartDot, i: number) => (
                            <ReferenceDot key={i} x={d.x} y={d.y} r={5} fill={d.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={1.5} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {chartDots.length > 0 && <div className="flex gap-3 mt-2 text-xs"><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span><span className="text-zinc-600">Trades marked on chart</span></div>}
                  </CardContent>
                </Card>
                <Card className="xl:col-span-2 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Allocation</CardTitle>
                    <div className="flex gap-1">
                      <Button variant={allocMode === "holding" ? "secondary" : "ghost"} size="xs" onClick={() => setAllocMode("holding")}>Holdings</Button>
                      <Button variant={allocMode === "account" ? "secondary" : "ghost"} size="xs" onClick={() => setAllocMode("account")}>Accounts</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {allocation.length === 0 ? <p className="text-sm text-zinc-500 py-10 text-center">No holdings — add one to see allocation</p> : (
                      <div className="flex gap-4">
                        <div className="w-40 h-40 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} stroke="none">
                                {allocation.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} formatter={(v)=>fmtGBP(Number(v))} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {allocation.map((a) => (
                            <div key={a.name} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2 text-zinc-400"><span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />{a.name}</span>
                              <span className="text-white tabular-nums">{a.pct.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="glass-card overflow-hidden">
                <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b border-white/5">
                  <CardTitle className="flex-1 text-white">Holdings</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or name" className="w-44 pl-8 h-8 bg-white/5 border-white/10 text-xs" />
                      {q && <button onClick={()=>setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"><X className="w-3 h-3"/></button>}
                    </div>
                    <Select value={sort} onValueChange={(v) => setSort(v as "value" | "gain" | "symbol")}>
                      <SelectTrigger className="w-28 h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="value">Value</SelectItem><SelectItem value="gain">Gain</SelectItem><SelectItem value="symbol">Symbol</SelectItem></SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-8 bg-white/5 border-white/10" onClick={exportCsv} disabled={!active.holdings.length}><Download className="w-3.5 h-3.5"/> CSV</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredHoldings.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><Wallet className="w-6 h-6 text-zinc-500"/></div>
                      <p className="text-sm text-zinc-400">{q?"No holdings match your search.":"No holdings yet."}</p>
                      <p className="text-xs text-zinc-600 mt-1">{q?"Try a different search or clear the filter.":"Add your first position to start tracking."}</p>
                      {!q && <Button className="mt-4" onClick={openAdd}><Plus className="w-4 h-4" /> Add holding</Button>}
                      {q && <Button variant="outline" className="mt-4" onClick={()=>setQ("")}>Clear search</Button>}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-zinc-500">Asset</TableHead>
                          <TableHead className="text-zinc-500 hidden md:table-cell">Shares • Avg</TableHead>
                          <TableHead className="text-right text-zinc-500">Value</TableHead>
                          <TableHead className="text-right text-zinc-500">Return</TableHead>
                          <TableHead className="text-right text-zinc-500 hidden sm:table-cell">Updated</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredHoldings.map((h: Holding) => {
                          const val = holdingValueGBP(h); const cost = holdingCostGBP(h); const pct = cost ? ((val - cost) / cost) * 100 : 0;
                          return (
                            <TableRow key={h.id} className="border-white/5 hover:bg-white/[0.04] cursor-pointer" onClick={() => setHoldingViewId(h.id)}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl grid place-items-center font-bold text-xs bg-white/10 border border-white/10 text-white shrink-0">{h.symbol.slice(0, 3)}</div>
                                  <div className="min-w-0"><div className="font-medium text-sm text-white truncate">{h.symbol}</div><div className="text-xs text-zinc-500 truncate max-w-[160px]">{h.name}</div><div className="text-xs text-zinc-600 md:hidden">{h.shares} × {fmtPrice(h.avgPrice, h.currency)}</div></div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-zinc-400 hidden md:table-cell">{h.shares} × {fmtPrice(h.avgPrice, h.currency)}</TableCell>
                              <TableCell className="text-right font-semibold text-white tabular-nums">{fmtGBP(val)}</TableCell>
                              <TableCell className="text-right"><Badge variant="outline" className="border-white/10" style={{ color: pct >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(pct)}</Badge></TableCell>
                              <TableCell className="text-right text-xs text-zinc-500 tabular-nums hidden sm:table-cell" title={h.lastRefreshedAt ? new Date(h.lastRefreshedAt * 1000).toLocaleString() : "Never refreshed (cron runs daily 06:00 UTC)"}>{fmtRelative(h.lastRefreshedAt)}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-0.5">
                                  <Button variant="ghost" size="icon-xs" className="hover:bg-emerald-500/10 hover:text-emerald-400" onClick={(e) => { e.stopPropagation(); openTrade(h, "buy"); }} aria-label="Buy more" title="Buy / DCA"><Plus className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon-xs" className="hover:bg-red-500/10 hover:text-red-400" onClick={(e) => { e.stopPropagation(); openTrade(h, "sell"); }} aria-label="Sell" title="Sell"><Minus className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); openEdit(h); }} aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setConfirmHolding({ id: h.id, symbol: h.symbol }); }} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </CardContent>
                </Card>

              <Card className="glass-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-white/5">
                  <CardTitle className="flex items-center gap-2 text-white"><History className="w-4 h-4" /> Trade history {transactions.length ? <Badge variant="outline" className="border-white/10 text-zinc-500">{transactions.length}</Badge> : null}</CardTitle>
                  <div className="text-xs text-zinc-500 hidden sm:block">Buy/sell events are marked on the chart</div>
                </CardHeader>
                <CardContent className="p-0">
                  {transactions.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><ShoppingCart className="w-5 h-5 text-zinc-500" /></div>
                      <p className="text-sm text-zinc-400">No trades yet</p>
                      <p className="text-xs text-zinc-600 mt-1">Use Buy to dollar-cost average, Sell to trim — avg cost updates automatically.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5 max-h-[320px] overflow-auto">
                      {transactions.slice(0, 50).map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                          <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${t.type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{t.type === "buy" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-white font-medium flex items-center gap-2"><span className={t.type === "buy" ? "text-emerald-400" : "text-red-400"}>{t.type === "buy" ? "Buy" : "Sell"}</span> {t.symbol} • {t.shares} @ £{Number(t.price).toFixed(2)} <span className="text-zinc-500 font-normal hidden sm:inline">• {t.date}</span></div>
                            <div className="text-xs text-zinc-500">{t.type === "buy" ? "DCA updated" : "Proceeds"} £{(t.shares * t.price).toFixed(2)}</div>
                          </div>
                          <span className="text-xs text-zinc-600 tabular-nums">{new Date(t.date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
                  <p className="text-sm mt-1 text-zinc-500">{accounts.length} accounts • {providers.length} providers • {portfolios.length} portfolios</p>
                  <p className="text-xs mt-1 text-zinc-600">Last snapshot {filteredSnapshots[filteredSnapshots.length - 1]?.date ?? "—"} • {portfolios.length === 0 && <><span className="mx-1">•</span> <Button variant="link" size="xs" className="h-auto p-0 text-xs" onClick={async () => { await handleCreate("ISA", "live", accounts[0]?.id ?? null); }}>Create first portfolio</Button></>}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="bg-white/5 border-white/10" onClick={refreshPrices} disabled={refreshing || portfolios.length===0}>
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>} Refresh prices
                  </Button>
                  <Button size="sm" onClick={()=>openWizard(null)}><Plus className="w-4 h-4"/> New portfolio</Button>
                </div>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1,2,3].map(i=> <Card key={i} className="glass-card p-6"><Skeleton className="h-6 w-24 bg-white/10 mb-4"/><Skeleton className="h-8 w-32 bg-white/10"/><Skeleton className="h-4 w-20 bg-white/10 mt-2"/></Card>)}
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Total value</CardTitle>
                    <Wallet className="w-4 h-4 text-zinc-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold tabular-nums text-white">{fmtGBP(totalValue)}</div>
                    <p className="text-xs text-zinc-500 mt-1">Cost {fmtGBP(totalCost)}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Total gain</CardTitle>
                    {totalGain >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold tabular-nums" style={{ color: totalGain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(totalGain)} <span className="text-sm font-medium">{fmtPct(totalGainPct)}</span></div>
                    <p className="text-xs text-zinc-500 mt-1">All accounts</p>
                  </CardContent>
                </Card>
                <Card className="glass-card">
                  <CardHeader className="pb-2"><CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Holdings</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">{portfolios.reduce((s, p) => s + p.holdings.length, 0)}</div>
                    <p className="text-xs text-zinc-500 mt-1">{accounts.length} accounts • {portfolios.length} portfolios</p>
                  </CardContent>
                </Card>
              </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-2 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Value over time</CardTitle>
                      <CardDescription>Overall + per-portfolio • {chartData.length} points • {range}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {(["1M", "3M", "1Y", "MAX"] as const).map((r) => (
                        <Button key={r} variant={range === r ? "secondary" : "ghost"} size="xs" onClick={() => setRange(r)}>{r}</Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v) => fmtGBP(Number(v))} />
                          <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" fill="#ffffff" fillOpacity={0.08} strokeWidth={2.5} dot={false} />
                          {Object.entries(byPortfolio).map(([pid, info]: [string, { name: string; data: Snapshot[] }], i) => {
                            const pf = portfolios.find(p=>p.id===pid);
                            const prov = pf ? providers.find(pr=> pr.id===pf.providerId) : null;
                            const acc = pf ? accounts.find(a=> a.id===pf.accountId) : null;
                            const col = pf?.color || prov?.color || acc?.color || PORTFOLIO_COLORS[info.name] || CHART_COLORS[i % CHART_COLORS.length];
                            return <Area key={pid} type="monotone" dataKey={info.name} stroke={col} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" />;
                          })}
                          {chartDots.map((d: ChartDot, i: number) => (
                            <ReferenceDot key={i} x={d.x} y={d.y} r={4} fill={d.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={1} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {chartDots.length > 0 && <div className="flex gap-3 mt-2 text-xs"><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span></div>}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs">
                      <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-3 h-0.5 bg-white" /> Total</span>
                      {Object.entries(byPortfolio).map(([pid, info]: [string, { name: string; data: Snapshot[] }], i) => {
                        const pf = portfolios.find(p=>p.id===pid);
                        const prov = pf ? providers.find(pr=> pr.id===pf.providerId) : null;
                        const acc = pf ? accounts.find(a=> a.id===pf.accountId) : null;
                        const col = pf?.color || prov?.color || acc?.color || CHART_COLORS[i % CHART_COLORS.length];
                        return <span key={info.name} className="flex items-center gap-1.5 text-zinc-500"><span className="w-3 h-0.5" style={{ background: col }} /> {info.name}</span>;
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Allocation</CardTitle>
                    <div className="flex gap-1">
                      <Button variant={allocMode === "holding" ? "secondary" : "ghost"} size="xs" onClick={() => setAllocMode("holding")}>Holdings</Button>
                      <Button variant={allocMode === "account" ? "secondary" : "ghost"} size="xs" onClick={() => setAllocMode("account")}>Accounts</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {allocation.length === 0 ? <div className="py-10 text-center"><p className="text-sm text-zinc-500">No holdings</p><p className="text-xs text-zinc-600 mt-1">Create a portfolio and add holdings</p><Button size="sm" className="mt-3" onClick={()=>openWizard(null)}><Plus className="w-3.5 h-3.5"/>New portfolio</Button></div> : (
                      <>
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} stroke="none">
                                {allocation.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} formatter={(v)=>fmtGBP(Number(v))} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2 mt-2">
                          {allocation.slice(0, 6).map((a) => (
                            <div key={a.name} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2 text-zinc-400"><span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />{a.name}</span>
                              <span className="text-white tabular-nums">{a.pct.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {overviewTx.transactions.length > 0 && (
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5">
                    <CardTitle className="flex items-center gap-2 text-white"><History className="w-4 h-4" /> Recent trades <Badge variant="outline" className="border-white/10 text-zinc-500">{overviewTx.transactions.length}</Badge></CardTitle>
                    <span className="text-xs text-zinc-500">Across all portfolios</span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5 max-h-[240px] overflow-auto">
                      {overviewTx.transactions.slice(0, 20).map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className={`w-6 h-6 rounded-lg grid place-items-center ${t.type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{t.type === "buy" ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}</span>
                          <span className="font-medium text-white">{t.symbol}</span><span className={t.type === "buy" ? "text-emerald-400" : "text-red-400"}>{t.type === "buy" ? "Buy" : "Sell"}</span><span className="text-zinc-400">{t.shares} @ £{Number(t.price).toFixed(2)}</span><span className="ml-auto text-xs text-zinc-600">{t.date}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="glass-card overflow-hidden">
                <CardHeader className="border-b border-white/5 flex flex-row items-center justify-between">
                  <CardTitle className="text-white">Accounts & portfolios</CardTitle>
                  <Button variant="ghost" size="sm" className="text-zinc-400" onClick={()=>openWizard(null)}><Plus className="w-4 h-4"/> Portfolio</Button>
                </CardHeader>
                <CardContent className="p-0">
                  {portfolios.length === 0 && accounts.length === 0 ? <div className="p-10 text-center"><div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><Wallet className="w-6 h-6 text-zinc-500"/></div><p className="text-sm text-zinc-400">No accounts or portfolios yet.</p><p className="text-xs text-zinc-600 mt-1">Create an account → provider → portfolio.</p><div className="flex justify-center gap-2 mt-4"><Button onClick={()=> (document.querySelector("[aria-label='New account']") as HTMLElement | null)?.click()}><Plus className="w-4 h-4"/> New account</Button><Button variant="outline" className="bg-white/5 border-white/10" onClick={()=>openWizard(null)}>New portfolio</Button></div></div> : (
                    <div className="divide-y divide-white/5">
                      {accounts.map((acc) => {
                        const provs = providers.filter(pr=> pr.accountId===acc.id);
                        const direct = portfolios.filter(p=> p.accountId===acc.id && !p.providerId);
                        const viaProv = portfolios.filter(p=> provs.some(pr=> pr.id===p.providerId));
                        const allPs = [...direct, ...viaProv];
                        const accVal = allPs.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h), 0), 0);
                        return (
                          <div key={acc.id} className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-white flex items-center gap-2">{acc.name} <Badge variant="outline" className="border-white/10 text-zinc-500 text-xs">{provs.length} providers • {allPs.length} portfolios</Badge></span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-zinc-400 hidden sm:inline">{fmtGBP(accVal)}</span>
                                <Button variant="ghost" size="icon-xs" onClick={()=>openWizard(acc.id, null)} aria-label="Add portfolio"><Plus className="w-3.5 h-3.5"/></Button>
                                <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400 hover:bg-red-500/10" onClick={() => { setConfirmAccount(acc); setConfirmAccountInput(""); }} aria-label="Delete account"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                            {provs.length===0 && direct.length===0 ? <div className="p-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-center"><p className="text-xs text-zinc-500">No providers or portfolios. Add a provider first.</p><div className="flex justify-center gap-2 mt-2"><Button variant="ghost" size="sm" className="text-xs" onClick={()=>openWizard(acc.id, null)}><Plus className="w-3 h-3"/> Provider</Button><Button variant="ghost" size="sm" className="text-xs" onClick={()=>openWizard(acc.id, null)}><Plus className="w-3 h-3"/> Portfolio</Button></div></div> : (
                              <div className="space-y-4">
                                {provs.map(pr=>{
                                  const ps = portfolios.filter(p=> p.providerId===pr.id);
                                  const provVal = ps.reduce((s,p)=>s+p.holdings.reduce((a,h: Holding)=>a+holdingValueGBP(h),0),0);
                                  return (
                                    <div key={pr.id} className="rounded-xl bg-black/20 border border-white/5 p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-zinc-300 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-zinc-500"/>{pr.name} <Badge variant="outline" className="border-white/10 text-zinc-500 text-[11px]">{ps.length} portfolios</Badge></span>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-zinc-500 hidden sm:inline">{fmtGBP(provVal)}</span>
                                          <Button variant="ghost" size="icon-xs" onClick={()=>openWizard(acc.id, pr.id)}><Plus className="w-3 h-3"/></Button>
                                          <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={()=>{setConfirmProvider(pr); setConfirmProviderInput("");}}><Trash2 className="w-3 h-3"/></Button>
                                        </div>
                                      </div>
                                      {ps.length===0 ? <p className="text-xs text-zinc-600 px-1">No portfolios in this provider.</p> : (
                                        <div className="grid md:grid-cols-2 gap-3">
                                          {ps.map((p) => {
                                            const v = p.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
                                            const c = p.holdings.reduce((s, h: Holding) => s + holdingCostGBP(h), 0);
                                            const pct = c ? ((v - c) / c) * 100 : 0;
                                            return (
                                              <div key={p.id} className="group text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex flex-col gap-2 relative">
                                                <button onClick={() => setActiveId(p.id)} className="absolute inset-0 rounded-xl" aria-label={`Open ${p.name}`}/>
                                                <div className="flex items-center justify-between relative">
                                                  <span className="font-medium text-white text-sm">{p.name}</span>
                                                  <div className="flex items-center gap-1">
                                                    <Badge variant="outline" className="capitalize border-white/10 text-zinc-400 text-xs">{p.type}</Badge>
                                                    <Button variant="ghost" size="icon-xs" className="relative z-10 h-6 w-6" onClick={(e)=>{e.stopPropagation(); openEditPortfolio(p);}}><Pencil className="w-3 h-3"/></Button>
                                                  </div>
                                                </div>
                                                <div className="text-xl font-bold text-white relative">{fmtGBP(v)}</div>
                                                <div className="flex items-center gap-2 text-xs relative"><span className="text-zinc-500">{p.holdings.length} holdings</span><span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{fmtPct(pct)}</span></div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {(directHoldings.filter((h: Holding)=> h.providerId===pr.id).length>0) && (
                                        <div className="mt-3 pt-3 border-t border-white/5">
                                          <div className="text-[11px] tracking-widest uppercase text-zinc-600 mb-2">Direct stocks</div>
                                          <div className="grid md:grid-cols-2 gap-2">
                                            {directHoldings.filter((h: Holding)=> h.providerId===pr.id).map((h: Holding)=>(
                                              <div key={h.id} onClick={() => setHoldingViewId(h.id)} className="cursor-pointer hover:bg-white/[0.06] flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                                <span className="w-8 h-8 rounded grid place-items-center bg-white/10 text-xs font-bold">{h.symbol.slice(0,3)}</span>
                                                <div className="flex-1 min-w-0"><div className="text-sm text-white font-medium">{h.symbol}</div><div className="text-xs text-zinc-500 truncate">{h.name}</div></div>
                                                <span className="text-sm font-semibold text-white">{fmtGBP(holdingValueGBP(h))}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {direct.length>0 && (
                                  <div>
                                    <div className="text-[10px] tracking-widest uppercase text-zinc-600 mb-2">No provider — direct</div>
                                    <div className="grid md:grid-cols-2 gap-3">
                                      {direct.map((p) => {
                                        const v = p.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
                                        const c = p.holdings.reduce((s, h: Holding) => s + holdingCostGBP(h), 0);
                                        const pct = c ? ((v - c) / c) * 100 : 0;
                                        return (
                                          <div key={p.id} className="group text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex flex-col gap-2 relative">
                                            <button onClick={() => setActiveId(p.id)} className="absolute inset-0 rounded-xl" aria-label={`Open ${p.name}`}/>
                                            <div className="flex items-center justify-between relative">
                                              <span className="font-medium text-white text-sm">{p.name}</span>
                                              <div className="flex items-center gap-1">
                                                <Badge variant="outline" className="capitalize border-white/10 text-zinc-400 text-xs">{p.type}</Badge>
                                                <Button variant="ghost" size="icon-xs" className="relative z-10 h-6 w-6" onClick={(e)=>{e.stopPropagation(); openEditPortfolio(p);}}><Pencil className="w-3 h-3"/></Button>
                                              </div>
                                            </div>
                                            <div className="text-xl font-bold text-white relative">{fmtGBP(v)}</div>
                                            <div className="flex items-center gap-2 text-xs relative"><span className="text-zinc-500">{p.holdings.length} holdings</span><span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{fmtPct(pct)}</span></div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {(directHoldings.filter((h: Holding)=> h.accountId===acc.id && !h.providerId && !h.portfolioId).length>0) && (
                                  <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="text-[11px] tracking-widest uppercase text-zinc-600 mb-2">Direct stocks — {acc.name}</div>
                                    <div className="grid md:grid-cols-2 gap-2">
                                      {directHoldings.filter((h: Holding)=> h.accountId===acc.id && !h.providerId && !h.portfolioId).map((h: Holding)=>(
                                        <div key={h.id} onClick={() => setHoldingViewId(h.id)} className="cursor-pointer hover:bg-white/[0.06] flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                          <span className="w-8 h-8 rounded grid place-items-center bg-white/10 text-xs font-bold">{h.symbol.slice(0,3)}</span>
                                          <div className="flex-1 min-w-0"><div className="text-sm text-white font-medium">{h.symbol}</div><div className="text-xs text-zinc-500 truncate">{h.name}</div></div>
                                          <span className="text-sm font-semibold text-white">{fmtGBP(holdingValueGBP(h))}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {portfolios.filter((p) => !p.accountId && !p.providerId).length > 0 && (
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-zinc-400">Unassigned</span>
                            <span className="text-sm text-zinc-500">{portfolios.filter((p) => !p.accountId && !p.providerId).length} portfolios</span>
                          </div>
                          <div className="grid md:grid-cols-2 gap-3">
                            {portfolios.filter((p) => !p.accountId && !p.providerId).map((p) => {
                              const v = p.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h), 0);
                              const c = p.holdings.reduce((s, h: Holding) => s + holdingCostGBP(h), 0);
                              const pct = c ? ((v - c) / c) * 100 : 0;
                              return (
                                <div key={p.id} className="group text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex flex-col gap-2 relative">
                                  <button onClick={() => setActiveId(p.id)} className="absolute inset-0 rounded-xl" aria-label={`Open ${p.name}`}/>
                                  <div className="flex items-center justify-between relative">
                                    <span className="font-medium text-white text-sm">{p.name}</span>
                                    <Badge variant="outline" className="capitalize border-white/10 text-zinc-400 text-xs">{p.type}</Badge>
                                  </div>
                                  <div className="text-xl font-bold text-white relative">{fmtGBP(v)}</div>
                                  <div className="flex items-center gap-2 text-xs relative"><span className="text-zinc-500">{p.holdings.length} holdings</span><span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{fmtPct(pct)}</span></div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <Dialog open={showHolding} onOpenChange={setShowHolding}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-lg">
              <DialogHeader><DialogTitle className="flex items-center gap-2">{editingId ? <Pencil className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {editingId ? "Edit holding" : "Add holding"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {active?.type === "live" && !editingId && (
                  <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                    <Button variant={!effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={()=> setIsManual(false)}>Listed</Button>
                    <Button variant={effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={()=> setIsManual(true)}>Cash / Manual</Button>
                  </div>
                )}
                {active?.type === "live" && editingId && (
                  <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                    <Button variant={!effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={()=> setIsManual(false)}>Listed</Button>
                    <Button variant={effectiveIsManual ? "secondary" : "ghost"} size="sm" className="flex-1 h-7 text-xs" onClick={()=> setIsManual(true)}>Cash / Manual</Button>
                  </div>
                )}
                {effectiveIsManual ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Holding name *</Label>
                      <Input placeholder="e.g. Cash, Workplace Pension, Property" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className={formErrors.symbol?"border-red-500/50":""} />
                      {formErrors.symbol && <p className="text-xs text-red-400">{formErrors.symbol}</p>}
                      <p className="text-xs text-zinc-600">Manual — free-form, counts toward totals & charts. No ticker lookup.</p>
                    </div>
                    <div className="space-y-1.5"><Label>Description (optional)</Label><Input placeholder="e.g. Uninvested cash, Barclays savings" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 relative">
                        <Label>Symbol *</Label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <Input placeholder="AAPL or Apple" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} onFocus={()=> symbolResults.length && setShowSymbolMenu(true)} onBlur={()=> setTimeout(()=> setShowSymbolMenu(false), 180)} className={formErrors.symbol?"border-red-500/50":""} autoComplete="off" />
                            {showSymbolMenu && symbolResults.length>0 && (
                              <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden max-h-64 overflow-auto">
                                {symbolResults.map((r: SymbolResult)=> (
                                  <button key={r.symbol+r.exchange} type="button" onMouseDown={(e)=>{e.preventDefault(); selectSearchResult(r);}} className="w-full text-left px-3 py-2.5 hover:bg-white/5 flex items-center justify-between gap-2 border-b border-white/[0.04] last:border-0">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-white flex items-center gap-2"><span>{r.symbol}</span><Badge variant="outline" className="border-white/10 text-[10px] text-zinc-500">{r.exchange || r.exchDisp || "—"}</Badge>{r.price!=null && <span className="text-xs text-emerald-400">£{Number(r.price).toFixed(2)}</span>}</div>
                                      <div className="text-xs text-zinc-500 truncate">{r.name}</div>
                                    </div>
                                    <Plus className="w-3.5 h-3.5 text-zinc-600 shrink-0"/>
                                  </button>
                                ))}
                                {symbolSearching && <div className="px-3 py-2 text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Searching Yahoo…</div>}
                              </div>
                            )}
                          </div>
                          <Button variant="outline" size="sm" className="shrink-0 bg-white/5 border-white/10" onClick={()=>fetchQuote(form.symbol)} disabled={quoteLoading || !form.symbol.trim()} title="Fetch live price for this exchange">{quoteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <RefreshCw className="w-3.5 h-3.5"/>}</Button>
                        </div>
                        {formErrors.symbol && <p className="text-xs text-red-400">{formErrors.symbol}</p>}
                        {quoteInfo && <p className="text-xs text-zinc-500">{quoteInfo}</p>}
                        {!editingId && <p className="text-xs text-zinc-600">Type symbol or company name — Yahoo search</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Exchange</Label>
                        <Select value={form.exchange || "__auto"} onValueChange={(v)=> setForm({...form, exchange: (v as string)==="__auto" ? "" : (v as string) ?? ""})}>
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
                    <div className="space-y-1.5"><Label>Name</Label><Input placeholder="Apple Inc — auto-filled from Yahoo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>{effectiveIsManual ? "Amount (£) *" : "Shares *"}</Label><Input type="number" placeholder={effectiveIsManual ? "5000" : "10"} value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} className={formErrors.shares?"border-red-500/50":""} />{formErrors.shares && <p className="text-xs text-red-400">{formErrors.shares}</p>}{effectiveIsManual && <p className="text-xs text-zinc-600">Tip: use 1 share × price = total for cash</p>}</div>
                  <div className="space-y-1.5"><Label>{effectiveIsManual ? "Price (per unit) *" : "Avg price (cost) *"}</Label><Input type="number" placeholder={effectiveIsManual ? "1.00" : "150.00"} value={form.avgPrice} onChange={(e) => setForm({ ...form, avgPrice: e.target.value })} className={formErrors.avgPrice?"border-red-500/50":""} />{formErrors.avgPrice && <p className="text-xs text-red-400">{formErrors.avgPrice}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Current price {effectiveIsManual ? "" : <span className="text-zinc-500 font-normal">(live)</span>}</Label>{effectiveIsManual ? <Input type="number" placeholder="1.00" value={form.currentPrice} onChange={(e)=> setForm({...form, currentPrice:e.target.value})} /> : <div className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 flex items-center text-sm text-zinc-300">{form.currentPrice ? `£${Number(form.currentPrice).toFixed(2)}` : "—"}<span className="ml-auto text-xs text-zinc-600">read-only</span></div>}<p className="text-xs text-zinc-600">{effectiveIsManual ? "Keep equal to avg for cash" : "Auto-filled from Yahoo; avg cost is what you paid"}</p></div>
                  <div className="space-y-1.5"><Label>Purchase date</Label><Input type="date" value={form.purchaseDate} max={new Date().toISOString().split("T")[0]} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className={formErrors.purchaseDate?"border-red-500/50":""} />{formErrors.purchaseDate && <p className="text-xs text-red-400">{formErrors.purchaseDate}</p>}</div>
                </div>
                {active && <div className="flex gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {effectiveIsManual ? "Manual holdings are excluded from price refresh and count toward portfolio value and charts." : "Live prices refresh daily at 06:00 UTC. Use 'Refresh prices' on dashboard for manual update (24h limit)."}</div>}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setShowHolding(false)} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>} {saving?"Saving…":"Save"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!editPortfolioDialog} onOpenChange={o=>!o&&setEditPortfolioDialog(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Edit portfolio</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={editPF.name} onChange={e=>setEditPF({...editPF,name:e.target.value})} /></div>
                <div className="space-y-2"><Label>Type</Label>
                  <Select value={editPF.type} onValueChange={v=>setEditPF({...editPF,type:v as "live"|"manual"})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="live">Live</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Account</Label>
                  <Select value={editPF.accountId} onValueChange={(v)=>setEditPF({...editPF,accountId: v as string, providerId:"__none"})}>
                    <SelectTrigger><span className="flex-1 text-left truncate">{editPF.accountId === "__none" ? "Unassigned" : accounts.find((a)=>a.id===editPF.accountId)?.name ?? "—"}</span></SelectTrigger>
                    <SelectContent><SelectItem value="__none">Unassigned</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> Provider</Label>
                  <Select value={editPF.providerId} onValueChange={(v)=>setEditPF({...editPF, providerId: v as string})} disabled={editPF.accountId==="__none"}>
                    <SelectTrigger><span className="flex-1 text-left truncate">{editPF.providerId==="__none" ? "No provider" : providers.find(p=>p.id===editPF.providerId)?.name ?? "—"}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No provider</SelectItem>
                      {providers.filter(pr=> pr.accountId===editPF.accountId).map(pr=> <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={()=>setEditPortfolioDialog(null)}>Cancel</Button>
                <Button onClick={saveEditPortfolio} disabled={saving}>{saving?<Loader2 className="w-4 h-4 animate-spin"/> : null} Save</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!confirmPortfolio} onOpenChange={(o) => !o && setConfirmPortfolio(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete portfolio</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">This will permanently delete <span className="text-white font-medium">{confirmPortfolio?.name}</span> and its {confirmPortfolio?.holdings.length ?? 0} holdings. This cannot be undone.</p>
              <div className="space-y-2">
                <Label>Type <span className="text-white">{confirmPortfolio?.name}</span> to confirm</Label>
                <Input value={confirmPortfolioInput} onChange={(e) => setConfirmPortfolioInput(e.target.value)} placeholder={confirmPortfolio?.name} autoFocus />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmPortfolio(null)}>Cancel</Button>
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20" disabled={confirmPortfolioInput !== confirmPortfolio?.name} onClick={async () => { if (!confirmPortfolio) return; await remove(confirmPortfolio.id); setActiveId(null); setConfirmPortfolio(null); toast({title:"Portfolio deleted",variant:"success"}); }}>Delete portfolio</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!confirmAccount} onOpenChange={(o) => !o && setConfirmAccount(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete account</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">This will permanently delete account <span className="text-white font-medium">{confirmAccount?.name}</span>, its {providers.filter(pr=> pr.accountId===confirmAccount?.id).length} providers and {portfolios.filter((p) => p.accountId === confirmAccount?.id).length} portfolios. This cannot be undone.</p>
              <div className="space-y-2">
                <Label>Type <span className="text-white">{confirmAccount?.name}</span> to confirm</Label>
                <Input value={confirmAccountInput} onChange={(e) => setConfirmAccountInput(e.target.value)} placeholder={confirmAccount?.name} autoFocus />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmAccount(null)}>Cancel</Button>
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20" disabled={confirmAccountInput !== confirmAccount?.name} onClick={async () => { if (!confirmAccount) return; await handleRemoveAccount(confirmAccount.id); setConfirmAccount(null); }}>Delete account</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!confirmProvider} onOpenChange={(o) => !o && setConfirmProvider(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete provider</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">Delete provider <span className="text-white font-medium">{confirmProvider?.name}</span> and its {portfolios.filter(p=> p.providerId===confirmProvider?.id).length} portfolios? Portfolios will not be deleted, they&apos;ll move to &quot;No provider&quot;.</p>
              <div className="space-y-2">
                <Label>Type <span className="text-white">{confirmProvider?.name}</span> to confirm</Label>
                <Input value={confirmProviderInput} onChange={(e) => setConfirmProviderInput(e.target.value)} placeholder={confirmProvider?.name} autoFocus />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmProvider(null)}>Cancel</Button>
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20" disabled={confirmProviderInput !== confirmProvider?.name} onClick={async () => { if (!confirmProvider) return; await handleRemoveProvider(confirmProvider.id); setConfirmProvider(null); }}>Delete provider</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!confirmHolding} onOpenChange={(o) => !o && setConfirmHolding(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete holding</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">Delete <span className="text-white font-medium">{confirmHolding?.symbol}</span>? This cannot be undone.</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmHolding(null)}>Cancel</Button>
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" onClick={async () => { if (!confirmHolding || !active) return; await deleteHolding(active.id, confirmHolding.id); setConfirmHolding(null); toast({title:"Holding deleted",variant:"success"}); }}>Delete</Button>
              </div>
            </DialogContent>
          </Dialog>

          <TradeDialog open={showTrade} onOpenChange={setShowTrade} holding={tradeHolding} type={tradeType} onSubmit={handleTrade} />
        </div>
      </main>
    </div>
  );
}

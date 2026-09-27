"use client";
import { usePortfolios, useSnapshots, useAccounts, useTransactions, useProviders, useHoldings, useSettings } from "@/lib/store";
import type { Holding, Portfolio, Snapshot } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceDot } from "recharts";
import { Wallet, Plus, Trash2, Pencil, Search, X, RefreshCw, Download, AlertTriangle, Check, Loader2, ShoppingCart, Minus, History, ArrowDownRight, ArrowUpRight, Briefcase, FolderPlus, Activity, Target, Trophy, Clock3 } from "lucide-react";
import { TradeDialog } from "@/components/TradeDialog";
import { CreatePortfolioWizard } from "@/components/CreatePortfolioWizard";
import { IndividualDashboard } from "@/components/dashboard/IndividualDashboard";
import { MainDashboard } from "@/components/dashboard/MainDashboard";
import { PortfolioDashboard } from "@/components/dashboard/PortfolioDashboard";
import { WatchlistPanel } from "@/components/WatchlistPanel";
import { GoalPanel } from "@/components/GoalPanel";
import { PerformanceChart, type PerformanceChartRow } from "@/components/dashboard/PerformanceChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

import { PALETTE, portfolioTint } from "@/lib/colors";
import { fmtGBP, fmtPrice, fmtPct, fmtRelative, holdingValueGBP, holdingCostGBP, isListedSymbol, todayISODate, chartDateLabel, gbpAxisFormatter, paddedDomain, numericValues, filterByRange } from "@/lib/format";
import { useChartZoom, ZoomSelectionArea, ZoomResetButton } from "@/components/ChartZoom";
import { AllocationCard, type AllocationItem } from "@/components/dashboard/shared/AllocationCard";
const CHART_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#fb7185", "#38bdf8", "#f97316"];
const PORTFOLIO_COLORS: Record<string, string> = { ISA: "#60a5fa", SIPP: "#34d399", GIA: "#f472b6" };

type SymbolResult = { symbol: string; name: string; exchange: string; exchDisp?: string; price?: number | null; currency?: string | null; longname?: string; rawExchange?: string; type?: string };
type ChartDot = { x: string; y: number; type: "buy" | "sell"; symbol: string; date: string; shares: number; price: number };
type PortfolioUpdateBody = { id: string; name?: string; type?: string; accountId?: string | null; providerId?: string | null };
type ChartRow = { date: string; dateISO: string; total: number; [key: string]: string | number | null };

export type DashboardSection = "dashboard" | "watchlist" | "goals" | "performance";

export function Dashboard({ isDemo, section: requestedSection }: { isDemo?: boolean; section?: DashboardSection }) {
  const pathname = usePathname();
  const section = requestedSection ?? (pathname === "/performance" ? "performance" : pathname === "/watchlist" ? "watchlist" : pathname === "/goals" ? "goals" : "dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioFromUrl = searchParams.get("portfolio");
  const holdingFromUrl = searchParams.get("holding");
  const { accounts, create: createAccount, remove: removeAccount, rename: renameAccount, ready: accountsReady, error: accountsError, refresh: refreshAccounts } = useAccounts();

  const { providers, create: createProvider, remove: removeProvider, rename: renameProvider, refresh: refreshProviders } = useProviders();
  const { portfolios, create, remove, upsertHolding, deleteHolding, moveHolding, refresh: refreshPortfolios, ready: portfoliosReady, error: portfoliosError } = usePortfolios();
  const { holdings: allHoldingsList, refresh: refreshAllHoldings, error: holdingsError } = useHoldings();
  const directHoldings = useMemo(()=> allHoldingsList.filter((h: Holding)=> !h.portfolioId), [allHoldingsList]);
  const { settings } = useSettings();
  const { snapshots, byPortfolio } = useSnapshots(portfolios, directHoldings, settings.fxRates);
  const { toast } = useToast();
  const activeId = portfolioFromUrl;
  const [tradeHolding, setTradeHolding] = useState<Holding | null>(null);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [showTrade, setShowTrade] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardAccountId, setWizardAccountId] = useState<string | null>(null);
  const [wizardProviderId, setWizardProviderId] = useState<string | null>(null);
  const [showHolding, setShowHolding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  // Default chart range comes from user settings; once the viewer picks a
  // range manually we stop following the preference for this visit.
  const [range, setRange] = useState<"1M" | "3M" | "1Y" | "MAX">(section === "performance" ? "MAX" : "1Y");
  const rangeTouched = useRef(false);
  const rangeSection = useRef(section);
  useEffect(() => {
    if (rangeSection.current !== section) {
      rangeSection.current = section;
      rangeTouched.current = false;
    }
    if (rangeTouched.current) return;
    setRange(section === "performance" ? "MAX" : settings.defaultRange);
  }, [settings.defaultRange, section]);
  const pickRange = useCallback((r: "1M" | "3M" | "1Y" | "MAX") => {
    rangeTouched.current = true;
    setRange(r);
  }, []);
  const [benchmark, setBenchmark] = useState(isDemo ? "VWRL.L" : "__none__");
  const [benchmarkPrices, setBenchmarkPrices] = useState<{ key: string; rows: Array<{ date: string; price: number }> } | null>(null);
  useEffect(() => {
    if (section !== "performance" || benchmark === "__none__") return;
    let cancelled = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(benchmark)}&range=MAX`)
      .then(async (response) => response.ok ? (await response.json()).chart as Array<{ date: string; price: number }> : [])
      .then((rows) => { if (!cancelled) setBenchmarkPrices({ key: `${benchmark}:MAX`, rows }); })
      .catch(() => { if (!cancelled) setBenchmarkPrices({ key: `${benchmark}:MAX`, rows: [] }); });
    return () => { cancelled = true; };
  }, [benchmark, section]);
  // Overview chart series filters — toggle a series out to compare the rest on a tighter scale.
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [allocMode, setAllocMode] = useState<"holding" | "account" | "sector">("holding");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const active = useMemo(() => portfolios.find((p) => p.id === activeId) ?? null, [portfolios, activeId]);
  const holdingViewId = holdingFromUrl;
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
  const activeBaseColor = useMemo(()=>{ if(!active) return null; const prov = providers.find(pr=> pr.id===active.providerId); const acc = accounts.find(a=> a.id===active.accountId); return active.color || prov?.color || acc?.color || "#60a5fa"; }, [active, providers, accounts]);
  const overviewTx = useTransactions(null);
  const { create: createTx, refresh: refreshTx, remove: removeTx } = overviewTx;
  const displayTx = useMemo(
    () => (activeId ? overviewTx.transactions.filter((t) => t.portfolioId === activeId) : overviewTx.transactions),
    [activeId, overviewTx.transactions]
  );
  const transactions = displayTx;

  const openTrade = (h: Holding, type: "buy" | "sell") => { setTradeHolding(h); setTradeType(type); setShowTrade(true); };
  const handleTrade = async (data: { shares: number; price: number; date: string }) => {
    if (!tradeHolding) { toast({ title: "Cannot trade", description: "No holding selected", variant: "error" }); return; }
    try {
      await createTx({ portfolioId: tradeHolding.portfolioId ?? null, holdingId: tradeHolding.id, type: tradeType, shares: data.shares, price: data.price, date: data.date });
      await refreshPortfolios();
      await refreshTx();
      await refreshAllHoldings();
      toast({ title: tradeType === "buy" ? "Buy recorded" : "Sell recorded", description: `${tradeType === "buy" ? "+" : "-"}${data.shares} ${tradeHolding.symbol} @ ${fmtPrice(data.price, tradeHolding.currency)}`, variant: "success" });
    } catch (e: unknown) { toast({ title: "Trade failed", description: e instanceof Error ? e.message : String(e), variant: "error" }); throw e; }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm("Delete this trade and recalculate the position?")) return;
    try {
      await removeTx(id);
      await Promise.all([refreshPortfolios(), refreshAllHoldings(), refreshTx()]);
      toast({ title: "Trade deleted", description: "The affected position was recalculated.", variant: "success" });
    } catch (error) {
      toast({ title: "Could not delete trade", description: error instanceof Error ? error.message : String(error), variant: "error" });
    }
  };

  const { totalValue, totalCost, totalGain, totalGainPct } = useMemo(() => {
    const vPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h, settings.fxRates), 0), 0);
    const cPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingCostGBP(h, settings.fxRates), 0), 0);
    const vDirect = directHoldings.reduce((s, h: Holding) => s + holdingValueGBP(h, settings.fxRates), 0);
    const cDirect = directHoldings.reduce((s, h: Holding) => s + holdingCostGBP(h, settings.fxRates), 0);
    const v = vPort + vDirect;
    const c = cPort + cDirect;
    return { totalValue: v, totalCost: c, totalGain: v - c, totalGainPct: c ? ((v - c) / c) * 100 : 0 };
  }, [portfolios, directHoldings, settings.fxRates]);

  const accountInsights = useMemo(() => {
    const byId = new Map<string, { holding: Holding; portfolioName: string }>();
    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        byId.set(holding.id, { holding, portfolioName: portfolio.name });
      }
    }
    for (const holding of directHoldings) {
      if (!byId.has(holding.id)) byId.set(holding.id, { holding, portfolioName: "Direct holding" });
    }

    const positions = [...byId.values()].map(({ holding, portfolioName }) => {
      const value = holdingValueGBP(holding, settings.fxRates);
      const cost = holdingCostGBP(holding, settings.fxRates);
      const gain = value - cost;
      return {
        holding,
        portfolioName,
        value,
        gain,
        returnPct: cost > 0 ? (gain / cost) * 100 : null,
      };
    });
    const withCostBasis = positions.filter((position) => position.returnPct !== null);
    const largest = positions.reduce<typeof positions[number] | null>(
      (best, position) => !best || position.value > best.value ? position : best,
      null
    );
    const bestPerformer = withCostBasis.reduce<typeof withCostBasis[number] | null>(
      (best, position) => !best || position.returnPct! > best.returnPct! ? position : best,
      null
    );
    const latestRefresh = positions.reduce<number | null>((latest, position) => {
      const refreshedAt = position.holding.lastRefreshedAt;
      return refreshedAt && (!latest || refreshedAt > latest) ? refreshedAt : latest;
    }, null);

    return {
      positions,
      profitableCount: withCostBasis.filter((position) => position.gain > 0).length,
      losingCount: withCostBasis.filter((position) => position.gain < 0).length,
      unchangedCount: withCostBasis.filter((position) => position.gain === 0).length,
      largest,
      bestPerformer,
      latestRefresh,
      refreshedCount: positions.filter((position) => position.holding.lastRefreshedAt).length,
    };
  }, [portfolios, directHoldings, settings.fxRates]);

  const filteredSnapshots = useMemo(() => {
    return filterByRange(snapshots, range);
  }, [snapshots, range]);

  const chartData = useMemo<ChartRow[]>(() => {
    const activeSeries = active ? ((byPortfolio[active.id]?.data ?? []) as Snapshot[]) : [];
    if (active) {
      const trimmed = filterByRange(activeSeries, range);
      if (trimmed.length === 0) {
        const dateISO = todayISODate();
        return [{ date: chartDateLabel(dateISO), dateISO, total: active.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h, settings.fxRates), 0) }] as ChartRow[];
      }
      return trimmed.map((s) => ({ date: chartDateLabel(s.date), dateISO: s.date, total: s.value }));
    }
    if (filteredSnapshots.length === 0) {
      const dateISO = todayISODate();
      return [{ date: chartDateLabel(dateISO), dateISO, total: totalValue } as ChartRow];
    }
    const byPort = byPortfolio;
    const dates = filteredSnapshots.map((s) => s.date);
    return dates.map((d) => {
      const row: ChartRow = { date: chartDateLabel(d), dateISO: d, total: filteredSnapshots.find((s) => s.date === d)?.value ?? 0 };
      for (const [, info] of Object.entries(byPort)) {
        const v = info.data.find((x: Snapshot) => x.date === d)?.value;
        if (v != null) row[info.name] = v;
      }
      return row;
    });
  }, [filteredSnapshots, byPortfolio, totalValue, active, range, settings.fxRates]);

  const chartDots = useMemo(() => {
    if (!chartData.length) return [];
    const map = new Map(chartData.map((d) => [d.date, d.total]));
    return displayTx
      .map((t) => {
        const key = chartDateLabel(t.date);
        const y = map.get(key);
        if (y == null) return null;
        return { x: key, y, type: t.type, symbol: t.symbol, date: t.date, shares: t.shares, price: t.price };
      })
      .filter((x): x is ChartDot => x !== null);
  }, [displayTx, chartData]);

  const chartZoom = useChartZoom(chartData);
  const axisValues = useMemo(() => numericValues(chartZoom.visible), [chartZoom.visible]);
  const axisFmt = useMemo(() => gbpAxisFormatter(axisValues), [axisValues]);
  const yDomain = useMemo(() => paddedDomain(axisValues), [axisValues]);

  // Trade markers honour the user's "Show trade markers on charts" preference.
  const shownDots = useMemo(() => (settings.showTradeMarkers ? chartDots : []), [settings.showTradeMarkers, chartDots]);
  // Markers outside the zoomed period would land outside the X domain, so filter them too.
  const visibleDots = useMemo(() => {
    const dates = new Set(chartZoom.visible.map((d) => d.date));
    return shownDots.filter((d) => dates.has(d.x));
  }, [shownDots, chartZoom.visible]);

  const overviewSeries = useMemo(
    () =>
      Object.entries(byPortfolio).map(([pid, info]: [string, { name: string; data: Snapshot[] }], i) => {
        const pf = portfolios.find((p) => p.id === pid);
        const prov = pf ? providers.find((pr) => pr.id === pf.providerId) : null;
        const acc = pf ? accounts.find((a) => a.id === pf.accountId) : null;
        const color = pf?.color || prov?.color || acc?.color || PORTFOLIO_COLORS[info.name] || CHART_COLORS[i % CHART_COLORS.length];
        return { pid, name: info.name, color };
      }),
    [byPortfolio, portfolios, providers, accounts]
  );
  const performanceSeries = useMemo(
    () => overviewSeries.map((item) => ({ key: item.pid, name: item.name, color: item.color })),
    [overviewSeries]
  );
  const performanceRows = useMemo<PerformanceChartRow[]>(() => {
    const totalHistory = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const portfolioHistories = Object.entries(byPortfolio).map(([id, info]) => ({
      id,
      history: [...info.data].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    const dates = new Set<string>(totalHistory.map((snapshot) => snapshot.date));
    for (const { history } of portfolioHistories) for (const snapshot of history) dates.add(snapshot.date);
    const orderedDates = [...dates].sort((a, b) => a.localeCompare(b));
    if (!orderedDates.length) return [];

    const percentAt = (history: Snapshot[], date: string): number | null => {
      const first = history[0];
      if (!first || first.value <= 0 || date < first.date) return null;
      let latest: Snapshot | undefined;
      for (const snapshot of history) {
        if (snapshot.date > date) break;
        latest = snapshot;
      }
      return latest ? ((latest.value / first.value) - 1) * 100 : null;
    };

    const benchmarkHistory = benchmarkPrices?.key === `${benchmark}:MAX`
      ? [...benchmarkPrices.rows].filter((point) => Number.isFinite(point.price) && point.price > 0).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const userDataStart = orderedDates[0];
    const benchmarkBase = [...benchmarkHistory].reverse().find((point) => point.date <= userDataStart) ?? benchmarkHistory.find((point) => point.date >= userDataStart);

    return orderedDates.map((date) => {
      const row: PerformanceChartRow = { date: chartDateLabel(date), dateISO: date };
      const totalPct = percentAt(totalHistory, date);
      if (totalPct != null) row.total = totalPct;
      for (const { id, history } of portfolioHistories) {
        const value = percentAt(history, date);
        if (value != null) row[id] = value;
      }
      if (benchmarkBase && date >= userDataStart && date >= benchmarkBase.date) {
        let latestPrice: number | undefined;
        for (const point of benchmarkHistory) {
          if (point.date > date) break;
          latestPrice = point.price;
        }
        if (latestPrice != null) row.benchmark = ((latestPrice / benchmarkBase.price) - 1) * 100;
      }
      return row;
    });
  }, [snapshots, byPortfolio, benchmarkPrices, benchmark]);
  const performanceRangeRows = useMemo(() => filterByRange(performanceRows, range), [performanceRows, range]);
  const overviewVisibleKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!hiddenSeries.has("total")) keys.add("total");
    for (const s of overviewSeries) if (!hiddenSeries.has(s.pid)) keys.add(s.name);
    return keys;
  }, [overviewSeries, hiddenSeries]);
  // Axis values must follow the visible series only — the axis is relative
  // (not zero-based), so filtered-out series would otherwise skew both the
  // domain and the tick precision.
  const overviewAxisValues = useMemo(() => {
    const vals: number[] = [];
    for (const row of chartZoom.visible as Array<Record<string, unknown>>) {
      for (const k of overviewVisibleKeys) {
        const v = row[k];
        if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
      }
    }
    return vals;
  }, [chartZoom.visible, overviewVisibleKeys]);
  const overviewAxisFmt = useMemo(() => gbpAxisFormatter(overviewAxisValues), [overviewAxisValues]);
  const overviewYDomain = useMemo(() => paddedDomain(overviewAxisValues), [overviewAxisValues]);

  const allocation = useMemo(() => {
    const unique = new Map<string, Holding>();
    const parentByHolding = new Map<string, Portfolio>();
    if (active) {
      for (const h of active.holdings) {
        unique.set(h.id, h);
        parentByHolding.set(h.id, active);
      }
    } else {
      for (const p of portfolios) {
        for (const h of p.holdings) {
          unique.set(h.id, h);
          parentByHolding.set(h.id, p);
        }
      }
      for (const h of directHoldings) unique.set(h.id, h);
    }
    const holdings = [...unique.values()];
    const total = holdings.reduce((s, h: Holding) => s + holdingValueGBP(h, settings.fxRates), 0);
    if (!total) return [];
    const accountIds = new Set(accounts.map((a) => a.id));
    const resolveAccountId = (h: Holding): string | null => {
      if (h.accountId && accountIds.has(h.accountId)) return h.accountId;
      if (h.providerId) {
        const pr = providers.find((pp) => pp.id === h.providerId);
        if (pr?.accountId && accountIds.has(pr.accountId)) return pr.accountId;
      }
      const parent = parentByHolding.get(h.id);
      if (parent?.accountId && accountIds.has(parent.accountId)) return parent.accountId;
      return null;
    };
    if (allocMode === "account") {
      const byAccount = new Map<string, number>();
      let unassignedVal = 0;
      for (const h of holdings) {
        const v = holdingValueGBP(h, settings.fxRates);
        const accId = resolveAccountId(h);
        if (accId) byAccount.set(accId, (byAccount.get(accId) ?? 0) + v);
        else unassignedVal += v;
      }
      const out: AllocationItem[] = [];
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const v = byAccount.get(acc.id) ?? 0;
        if (v <= 0) continue;
        out.push({ name: acc.name, value: v, color: acc.color || PALETTE[i % PALETTE.length].value, pct: (v / total) * 100 });
      }
      if (unassignedVal > 0) out.push({ name: "Unassigned", value: unassignedVal, color: "#71717a", pct: (unassignedVal / total) * 100 });
      return out.sort((a, b) => b.value - a.value);
    }
    if (allocMode === "sector") {
      const bySector = new Map<string, number>();
      for (const h of holdings) {
        const key = h.sector?.trim() || "Unclassified";
        bySector.set(key, (bySector.get(key) ?? 0) + holdingValueGBP(h, settings.fxRates));
      }
      return [...bySector.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length], pct: value / total * 100 }));
    }
    const bySymbol = new Map<string, { value: number; colorBase: string | null }>();
    for (const h of holdings) {
      const v = holdingValueGBP(h, settings.fxRates);
      const parent = parentByHolding.get(h.id);
      let base: string | null = parent?.color || null;
      if (!base && h.providerId) base = providers.find((pr) => pr.id === h.providerId)?.color ?? null;
      if (!base && h.accountId) base = accounts.find((a) => a.id === h.accountId)?.color ?? null;
      const prev = bySymbol.get(h.symbol);
      if (prev) prev.value += v;
      else bySymbol.set(h.symbol, { value: v, colorBase: base });
    }
    const activeBase = active
      ? (active.color || providers.find((pr) => pr.id === active.providerId)?.color || accounts.find((a) => a.id === active.accountId)?.color || CHART_COLORS[0])
      : null;
    return [...bySymbol.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([symbol, info], i) => ({
        name: symbol,
        value: info.value,
        color: portfolioTint(active ? activeBase : info.colorBase, i),
        pct: (info.value / total) * 100,
      }));
  }, [active, portfolios, allocMode, accounts, providers, directHoldings, settings]);

  const handleCreate = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    try { const r = await create(name, type, accountId ?? null, providerId ?? null); toast({title:"Portfolio created",description:name,variant:"success"}); return r; } catch(e: unknown){toast({title:"Failed to create portfolio",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  };
  const handleCreateAccount = useCallback(async (name: string) => {
    try { await createAccount(name); await refreshProviders(); } catch(e: unknown){ toast({title:"Failed",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  }, [createAccount, refreshProviders, toast]);
  const handleCreateProvider = useCallback(async (name: string, accountId: string) => {
    try { await createProvider(name, accountId); toast({title:"Provider created",description:name,variant:"success"});} catch(e: unknown){toast({title:"Failed to create provider",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  }, [createProvider, toast]);
  const handleRenameAccount = useCallback(async (id:string,name:string)=>{ await renameAccount(id,name); await refreshPortfolios(); }, [renameAccount, refreshPortfolios]);
  const handleRenameProvider = useCallback(async (id:string,name:string)=>{ await renameProvider(id,name); await refreshPortfolios(); }, [renameProvider, refreshPortfolios]);
  const handleRenamePortfolio = useCallback(async (id:string,patch: { name?: string; type?: string; accountId?: string | null; providerId?: string | null })=>{ if(patch.accountId!==undefined || patch.providerId!==undefined || patch.name!==undefined || patch.type!==undefined){ const body: PortfolioUpdateBody={id}; if(patch.name!==undefined) body.name=patch.name; if(patch.type!==undefined) body.type=patch.type; if(patch.accountId!==undefined) body.accountId=patch.accountId; if(patch.providerId!==undefined) body.providerId=patch.providerId; await fetch("/api/portfolios",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(async r=>{ if(!r.ok) throw new Error(await r.text()); }); await refreshPortfolios(); } }, [refreshPortfolios]);
  const handleRemoveAccount = async (id: string) => {
    try { await removeAccount(id); await refreshProviders(); await refreshPortfolios(); toast({title:"Account deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };
  const handleRemoveProvider = async (id: string) => {
    try { await removeProvider(id); await refreshPortfolios(); toast({title:"Provider deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "gain" | "symbol">("value");
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0], exchange: "", currency: "GBP", sector: "" });
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
      else if(!isListedSymbol(form.symbol.trim())) e.symbol="Invalid symbol";
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
    let stale = false;
    const t = setTimeout(async ()=>{
      setSymbolSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (stale) return;
        const arr = Array.isArray(j) ? j : [];
        setSymbolResults(arr);
        setShowSymbolMenu(arr.length > 0);
      } catch { if (!stale) setSymbolResults([]); }
      finally { if (!stale) setSymbolSearching(false); }
    }, 320);
    return ()=>{ stale = true; clearTimeout(t); };
  }, [form.symbol, showHolding, editingId, effectiveIsManual]);

  const selectSearchResult = (r: SymbolResult) => {
    setForm(f=> ({ ...f, symbol: r.symbol?.toUpperCase() ?? f.symbol, name: r.name ?? r.longname ?? f.name, exchange: r.exchange ?? f.exchange, currentPrice: r.price != null ? String(r.price) : f.currentPrice, currency: r.currency ?? r.currency ?? f.currency }));
    setShowSymbolMenu(false);
    setSymbolResults([]);
    if (r.price != null) setQuoteInfo(`Yahoo: ${fmtPrice(r.price, r.currency)} • ${r.exchDisp ?? r.exchange}`);
    else if (r.symbol) fetchQuote(r.symbol);
  };

  const openAdd = () => { const manualDefault = active?.type === "manual"; setIsManual(manualDefault); setForm({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0], exchange: "", currency: settings.currency || "GBP", sector: "" }); setEditingId(null); setFormErrors({}); setQuoteInfo(""); setShowSymbolMenu(false); setSymbolResults([]); setShowHolding(true); };
  const openEdit = (h: Holding) => { const manualDetected = active?.type === "manual" || !isListedSymbol(h.symbol); setIsManual(manualDetected); setForm({ symbol: h.symbol, name: h.name, shares: String(h.shares), avgPrice: String(h.avgPrice), currentPrice: String(h.currentPrice), purchaseDate: h.purchaseDate?.split("T")[0] ?? new Date().toISOString().split("T")[0], exchange: h.exchange ?? "", currency: h.currency ?? "GBP", sector: h.sector ?? "" }); setEditingId(h.id); setFormErrors({}); setQuoteInfo(""); setShowSymbolMenu(false); setSymbolResults([]); setShowHolding(true); };

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
      await upsertHolding(activeId, { id: editingId ?? undefined, symbol: form.symbol.toUpperCase().trim(), name: form.name?.trim() || form.symbol.toUpperCase().trim(), shares: Number(form.shares), avgPrice: Number(form.avgPrice), currentPrice: Number(form.currentPrice || form.avgPrice), currency: form.currency || "GBP", sector: form.sector.trim() || null, purchaseDate: form.purchaseDate, exchange: form.exchange || undefined });
      setShowHolding(false); toast({title: editingId?"Holding updated":"Holding added",description:form.symbol.toUpperCase(),variant:"success"});
    } catch(e: unknown){ toast({title:"Save failed",description:e instanceof Error ? e.message : String(e),variant:"error"}); setFormErrors({symbol: e instanceof Error ? e.message : String(e)}); }
    finally{ setSaving(false); }
  };

  const activeValue = active ? active.holdings.reduce((s, h: Holding) => s + holdingValueGBP(h, settings.fxRates), 0) : totalValue;
  const activeCost = active ? active.holdings.reduce((s, h: Holding) => s + holdingCostGBP(h, settings.fxRates), 0) : totalCost;
  const activeGain = activeValue - activeCost;
  const activeGainPct = activeCost ? (activeGain / activeCost) * 100 : 0;

  const filteredHoldings = useMemo(() => {
    if (!active) return [];
    let hs = active.holdings.filter((h) => !q || h.symbol.toLowerCase().includes(q.toLowerCase()) || h.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === "value") hs = [...hs].sort((a: Holding, b: Holding) => holdingValueGBP(b, settings.fxRates) - holdingValueGBP(a, settings.fxRates));
    else if (sort==="gain") hs = [...hs].sort((a: Holding, b: Holding) => (holdingValueGBP(b, settings.fxRates) - holdingCostGBP(b, settings.fxRates)) - (holdingValueGBP(a, settings.fxRates) - holdingCostGBP(a, settings.fxRates)));
    else hs = [...hs].sort((a,b)=> a.symbol.localeCompare(b.symbol));
    return hs;
  }, [active, q, sort, settings.fxRates]);

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

  const openWizard = useCallback((accountId: string | null = null, providerId: string | null = null) => {
    setWizardAccountId(accountId);
    setWizardProviderId(providerId);
    setShowWizard(true);
  }, []);

  const [assignHolding, setAssignHolding] = useState<Holding | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>("__pick__");
  const [assignName, setAssignName] = useState("");
  const [assignAccountId, setAssignAccountId] = useState<string>("__none");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");

  const openAssign = (h: Holding) => {
    setAssignHolding(h);
    setAssignTarget(portfolios.length ? "__pick__" : "__new__");
    setAssignName("");
    setAssignAccountId(h.accountId ?? "__none");
    setAssignError("");
  };
  const closeAssign = () => { setAssignHolding(null); setAssignError(""); };

  const confirmAssign = async () => {
    const h = assignHolding;
    if (!h) return;
    if (assignTarget === "__pick__") { setAssignError("Choose a portfolio, or create a new one"); return; }
    setAssignSaving(true);
    setAssignError("");
    try {
      let pid = assignTarget;
      let pfName = "";
      if (assignTarget === "__new__") {
        const name = assignName.trim();
        if (name.length < 2) { setAssignError("Portfolio name must be at least 2 characters"); return; }
        const accountId = assignAccountId === "__none" ? null : assignAccountId;
        const providerId = accountId && h.providerId && providers.find((pr) => pr.id === h.providerId)?.accountId === accountId ? h.providerId : null;
        const created = await create(name, isListedSymbol(h.symbol) ? "live" : "manual", accountId, providerId);
        pid = created.id;
        pfName = name;
      } else {
        pfName = portfolios.find((p) => p.id === pid)?.name ?? "";
      }
      await moveHolding(h.id, pid);
      await refreshPortfolios();
      await refreshAllHoldings();
      toast({ title: "Added to portfolio", description: `${h.symbol} → ${pfName}`, variant: "success" });
      closeAssign();
    } catch (e: unknown) {
      toast({ title: "Could not add to portfolio", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setAssignSaving(false);
    }
  };

  const refreshPrices = async()=>{
    const allHs = [...portfolios.flatMap(p=>p.holdings), ...directHoldings];
    if(allHs.length===0) return;
    setRefreshing(true);
    try{
      const manualIds = new Set(portfolios.filter((p) => p.type === "manual").map((p) => p.id));
      const symbols = allHs.filter((h: Holding)=> isListedSymbol(h.symbol) && !(h.portfolioId && manualIds.has(h.portfolioId))).map(h=>({symbol:h.symbol,exchange:h.exchange}));
      if(!symbols.length) { toast({title:"No holdings to refresh",variant:"info"}); return; }
      const r = await fetch("/api/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols})});
      const quotes = await r.json();
      if(!Object.keys(quotes).length) { toast({title:"No prices returned",variant:"info"}); return; }
      const patch = await fetch("/api/holdings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols:quotes})});
      const j = await patch.json();
      if(!patch.ok){ toast({title:j.message||j.error||"Refresh limited",description:j.nextAllowedAt?`Next allowed ${new Date(j.nextAllowedAt*1000).toLocaleTimeString()}`:undefined,variant:"error"}); return; }
      await refreshPortfolios();
      await refreshAllHoldings();
      toast({title:`Updated ${j.updated} holdings`,description:j.skipped?`${j.skipped} skipped (24h limit)`:undefined,variant:"success"});
    } catch(e: unknown){ toast({title:"Refresh failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
    finally{setRefreshing(false);}
  };

  const exportCsv = ()=>{
    if(!active) return;
    const rows = [["Symbol","Name","Shares","AvgPrice","CurrentPrice","Value","Gain","PurchaseDate"]];
    for(const h of active.holdings){ const v=holdingValueGBP(h, settings.fxRates), c=holdingCostGBP(h, settings.fxRates); rows.push([h.symbol,h.name,String(h.shares),String(h.avgPrice),String(h.currentPrice),String(v),String(v-c),h.purchaseDate]); }
    const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${active.name}-holdings.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  const handleWizardCreate = async (name: string, type: "live" | "manual", accountId: string | null, providerId: string | null, extra?: { symbol?: string; shares?: string }) => {
    const created = await handleCreate(name, type, accountId, providerId);
    if (extra?.symbol && created?.id) {
      try {
        let price = 100;
        try{ const q = await fetch(`/api/quote?symbol=${encodeURIComponent(extra.symbol)}`).then(r=>r.json()); const hit=q[extra.symbol.toUpperCase()] ?? q[`${extra.symbol.toUpperCase()}:`]; if(hit?.price) price=hit.price; } catch{}
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
            currency: settings.currency || "GBP",
            purchaseDate: todayISODate(),
          }),
        });
        await refreshPortfolios();
      } catch {}
    }
  };

  const isLoading = !portfoliosReady;

  const selectPortfolio = useCallback((id: string | null) => {
    if (id) router.push(`/dashboard?portfolio=${encodeURIComponent(id)}`);
    else router.replace("/dashboard");
  }, [router]);
  const selectHolding = useCallback((h: Holding) => {
    router.push(`/dashboard?holding=${encodeURIComponent(h.id)}`);
  }, [router]);
  const requestDeleteAccount = useCallback((account: (typeof accounts)[number]) => setConfirmAccount(account), [setConfirmAccount]);
  const requestDeleteProvider = useCallback((provider: (typeof providers)[number]) => setConfirmProvider(provider), [setConfirmProvider]);
  const requestDeletePortfolio = useCallback((portfolio: Portfolio) => setConfirmPortfolio(portfolio), [setConfirmPortfolio]);

  return (
    <div className="flex min-h-screen">
      <Sidebar accounts={accounts} providers={providers} portfolios={portfolios} holdings={directHoldings} activeId={activeId} onSelect={selectPortfolio} onSelectHolding={selectHolding} onCreateAccount={handleCreateAccount} onCreateProvider={handleCreateProvider} onOpenWizard={openWizard} onRefresh={refreshAllHoldings} isDemo={isDemo} accountsReady={accountsReady} portfoliosReady={portfoliosReady} onRenameAccount={handleRenameAccount} onRenameProvider={handleRenameProvider} onRenamePortfolio={handleRenamePortfolio}
        onDeleteAccount={requestDeleteAccount}
        onDeleteProvider={requestDeleteProvider}
        onDeletePortfolio={requestDeletePortfolio} />
      <main className="flex-1 min-w-0 pt-12 xl:pt-0">
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-8 space-y-6">
          {(portfoliosError || holdingsError || accountsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span><AlertTriangle className="inline w-4 h-4 mr-2" />Some portfolio data could not be loaded. Your saved data has not been deleted. {portfoliosError || holdingsError || accountsError}</span>
              <Button variant="outline" size="sm" className="border-amber-500/30 bg-black/20" onClick={() => void Promise.all([refreshPortfolios(), refreshAllHoldings(), refreshAccounts(), refreshProviders()])}>Retry</Button>
            </div>
          )}
          {section === "watchlist" ? (
            <section className="space-y-4">
              <div><h1 className="text-3xl font-bold tracking-tight text-white">Watchlist</h1><p className="mt-1 text-sm text-zinc-500">Keep an eye on symbols before adding them to a portfolio.</p></div>
              <WatchlistPanel />
            </section>
          ) : section === "goals" ? (
            <section className="space-y-4">
              <div><h1 className="text-3xl font-bold tracking-tight text-white">Goals</h1><p className="mt-1 text-sm text-zinc-500">Track your progress toward a portfolio target.</p></div>
              <GoalPanel currentValue={totalValue} history={snapshots} dateFormat={settings.dateFormat} />
            </section>
          ) : section === "performance" ? (
            <PerformanceChart
              data={performanceRangeRows}
              series={performanceSeries}
              range={range}
              onRangeChange={pickRange}
              benchmark={benchmark}
              onBenchmarkChange={setBenchmark}
            />
          ) : showWizard ? (
            <CreatePortfolioWizard open={showWizard} onOpenChange={setShowWizard} accounts={accounts} providers={providers} defaultAccountId={wizardAccountId} defaultProviderId={wizardProviderId}
              onCreate={handleWizardCreate} inline />
          ) : viewHolding ? (
            <IndividualDashboard
              holding={viewHolding}
              portfolioId={viewPortfolio?.id ?? null}
              portfolioName={viewPortfolio?.name ?? providers.find((provider) => provider.id === viewHolding.providerId)?.name ?? accounts.find((account) => account.id === viewHolding.accountId)?.name}
              color={viewColor}
              onBack={() => router.replace("/dashboard")}
              onBuy={() => openTrade(viewHolding, "buy")}
              onSell={() => openTrade(viewHolding, "sell")}
              onAddToPortfolio={() => openAssign(viewHolding)}
            >
          <Dialog open={!!assignHolding} onOpenChange={(o) => { if (!o) closeAssign(); }}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><FolderPlus className="w-4 h-4" /> Add {assignHolding?.symbol} to a portfolio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-zinc-500 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 leading-relaxed">Group this holding with others in a portfolio. Its trades move with it either way.</p>
                {portfolios.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Portfolio</Label>
                    <Select value={assignTarget} onValueChange={(v) => { setAssignTarget(v ?? "__pick__"); setAssignError(""); }}>
                      <SelectTrigger className="h-10 bg-white/5 border-white/10">
                        <span className="flex-1 text-left truncate text-sm">{assignTarget === "__new__" ? "Create a new portfolio…" : assignTarget === "__pick__" ? "Choose a portfolio…" : portfolios.find((p) => p.id === assignTarget)?.name ?? "—"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pick__">Choose a portfolio…</SelectItem>
                        {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        <SelectItem value="__new__">Create a new portfolio…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {assignTarget === "__new__" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input value={assignName} onChange={(e) => setAssignName(e.target.value)} placeholder="e.g. ISA — Growth" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Account</Label>
                      <Select value={assignAccountId} onValueChange={(v) => setAssignAccountId(v ?? "__none")}>
                        <SelectTrigger className="h-10 bg-white/5 border-white/10"><span className="flex-1 text-left truncate text-sm">{assignAccountId === "__none" ? "No account" : accounts.find((a) => a.id === assignAccountId)?.name ?? "—"}</span></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No account</SelectItem>
                          {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-600">Creates a {isListedSymbol(assignHolding?.symbol ?? "") ? "live" : "manual"} portfolio{assignAccountId === "__none" ? "" : ` under ${accounts.find((a) => a.id === assignAccountId)?.name ?? ""}`}.</p>
                    </div>
                  </div>
                )}
                {assignError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{assignError}</p>}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={closeAssign} disabled={assignSaving}>Cancel</Button>
                <Button onClick={() => void confirmAssign()} disabled={assignSaving || assignTarget === "__pick__"}>{assignSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} {assignTarget === "__new__" ? "Create & add" : "Add to portfolio"}</Button>
              </div>
            </DialogContent>
          </Dialog>
            </IndividualDashboard>
          ) : active ? (
            <PortfolioDashboard
              portfolio={active}
              accounts={accounts}
              providers={providers}
              color={activeBaseColor}
              dateFormat={settings.dateFormat}
              value={activeValue}
              cost={activeCost}
              gain={activeGain}
              gainPct={activeGainPct}
              onBack={() => router.replace("/dashboard")}
              onEdit={() => openEditPortfolio(active)}
              onAddHolding={openAdd}
              onDelete={() => { setConfirmPortfolio(active); setConfirmPortfolioInput(""); }}
            >
              <>
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <Card className="xl:col-span-3 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Performance</CardTitle>
                      <CardDescription>{chartData.length} points • {active.name} {chartDots.length ? `• ${chartDots.length} trades` : ""}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      {(["1M", "3M", "1Y", "MAX"] as const).map((r) => (
                        <Button key={r} variant={range === r ? "secondary" : "ghost"} size="xs" onClick={() => pickRange(r)}>{r}</Button>
                      ))}
                      {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px] select-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                          <YAxis domain={yDomain ?? ["auto", "auto"]} tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v) => fmtGBP(Number(v))} />
                          {(() => { const prov = providers.find(pr=> pr.id===active.providerId); const acc = accounts.find(a=> a.id===active.accountId); const col = active.color || prov?.color || acc?.color || "#60a5fa"; return <Area type="monotone" dataKey="total" name={active.name} stroke={col} fill={col} fillOpacity={0.14} strokeWidth={2.5} dot={false} />; })()}
                          {visibleDots.map((d: ChartDot) => (
                            <ReferenceDot key={`${d.date}-${d.symbol}-${d.x}`} x={d.x} y={d.y} r={5} fill={d.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={1.5} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {shownDots.length > 0 && <div className="flex gap-3 mt-2 text-xs"><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span><span className="text-zinc-600">Trades marked on chart</span></div>}
                  </CardContent>
                </Card>
                <div className="xl:col-span-2 min-w-0">
                  <AllocationCard allocation={allocation} mode={allocMode} onModeChange={setAllocMode} layout="fill" />
                </div>
              </div>

              <Card className="glass-card overflow-hidden">
                <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b border-white/5">
                  <CardTitle className="flex-1 text-white">Holdings</CardTitle>
                  <div className="text-[11px] text-zinc-500 hidden lg:block mr-1">Buy / Sell on each row records a trade</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or name" className="w-44 pl-8 h-8 bg-white/5 border-white/10 text-xs" />
                      {q && <button onClick={()=>setQ("")} aria-label="Clear holdings search" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"><X className="w-3 h-3"/></button>}
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
                          <TableHead className="w-36"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredHoldings.map((h: Holding) => {
                           const val = holdingValueGBP(h, settings.fxRates); const cost = holdingCostGBP(h, settings.fxRates); const pct = cost ? ((val - cost) / cost) * 100 : 0;
                          return (
                            <TableRow key={h.id} className="border-white/5 hover:bg-white/[0.04] cursor-pointer" onClick={() => router.push(`/dashboard?holding=${encodeURIComponent(h.id)}`)}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl grid place-items-center font-bold text-xs bg-white/10 border border-white/10 text-white shrink-0">{h.symbol.slice(0, 3)}</div>
                                  <div className="min-w-0"><div className="font-medium text-sm text-white truncate">{h.symbol}</div><div className="text-xs text-zinc-500 truncate max-w-[160px]">{h.name}</div><div className="text-xs text-zinc-600 md:hidden">{h.shares} × {fmtPrice(h.avgPrice, h.currency)}</div></div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-zinc-400 hidden md:table-cell">{h.shares} × {fmtPrice(h.avgPrice, h.currency)}</TableCell>
                              <TableCell className="text-right font-semibold text-white tabular-nums">{fmtGBP(val)}</TableCell>
                              <TableCell className="text-right"><Badge variant="outline" className="border-white/10" style={{ color: pct >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(pct)}</Badge></TableCell>
                              <TableCell className="text-right text-xs tabular-nums hidden sm:table-cell" title={h.lastRefreshedAt ? new Date(h.lastRefreshedAt * 1000).toLocaleString(settings.dateFormat) : "Never refreshed (cron runs daily 06:00 UTC)"}>
                                {active.type === "live" && isListedSymbol(h.symbol) && (!h.lastRefreshedAt || fmtRelative(h.lastRefreshedAt, settings.dateFormat).includes("d ago"))
                                  ? <span className="text-amber-400" title="Yahoo Finance has not refreshed this price recently">Stale · {fmtRelative(h.lastRefreshedAt, settings.dateFormat)}</span>
                                  : <span className="text-zinc-500">{fmtRelative(h.lastRefreshedAt, settings.dateFormat)}</span>}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <Button variant="outline" size="xs" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" onClick={(e) => { e.stopPropagation(); openTrade(h, "buy"); }} title="Buy / DCA"><Plus className="w-3.5 h-3.5" /> Buy</Button>
                                  <Button variant="outline" size="xs" className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" onClick={(e) => { e.stopPropagation(); openTrade(h, "sell"); }} title="Sell"><Minus className="w-3.5 h-3.5" /> Sell</Button>
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
                  <div className="text-xs text-zinc-500 hidden sm:block">Buy/sell from Holdings • events marked on the chart</div>
                </CardHeader>
                <CardContent className="p-0">
                  {transactions.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><ShoppingCart className="w-5 h-5 text-zinc-500" /></div>
                      <p className="text-sm text-zinc-400">No trades yet</p>
                      <p className="text-xs text-zinc-600 mt-1">Use Buy to dollar-cost average, Sell to trim — avg cost updates automatically.</p>
                      {active.holdings.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                          {active.holdings.length === 1 ? (
                            <>
                              <Button size="sm" variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" onClick={() => openTrade(active.holdings[0], "buy")}><Plus className="w-3.5 h-3.5" /> Buy {active.holdings[0].symbol}</Button>
                              <Button size="sm" variant="outline" className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" onClick={() => openTrade(active.holdings[0], "sell")}><Minus className="w-3.5 h-3.5" /> Sell {active.holdings[0].symbol}</Button>
                            </>
                          ) : (
                            <p className="text-xs text-zinc-500">Use the <span className="text-emerald-400 font-medium">Buy</span> / <span className="text-red-400 font-medium">Sell</span> buttons on any holding above to record a trade.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-600 mt-3">Add a holding first, then record buys and sells here.</p>
                      )}
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
                          <span className="text-xs text-zinc-600 tabular-nums">{new Date(t.date).toLocaleDateString(settings.dateFormat, { month: "short", day: "numeric" })}</span>
                          <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" title="Delete trade and reverse its position impact" onClick={() => void handleDeleteTransaction(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
            </PortfolioDashboard>
          ) : (
            <MainDashboard
              accountsCount={accounts.length}
              providersCount={providers.length}
              portfoliosCount={portfolios.length}
              latestSnapshot={filteredSnapshots[filteredSnapshots.length - 1]?.date ?? "—"}
              holdingCount={portfolios.reduce((sum, portfolio) => sum + portfolio.holdings.length, 0)}
              totalValue={totalValue}
              totalCost={totalCost}
              totalGain={totalGain}
              totalGainPct={totalGainPct}
              isLoading={isLoading}
              refreshing={refreshing}
              canRefresh={portfolios.length > 0}
              onRefresh={() => { void refreshPrices(); }}
              onNewPortfolio={() => openWizard(null)}
              onCreateFirstPortfolio={() => { void handleCreate("ISA", "live", accounts[0]?.id ?? null); }}
            >
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-2 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Value over time</CardTitle>
                      <CardDescription>Overall + per-portfolio • {chartData.length} points • {range}{hiddenSeries.size > 0 ? ` • ${overviewVisibleKeys.size}/${1 + overviewSeries.length} series` : ""}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      {(["1M", "3M", "1Y", "MAX"] as const).map((r) => (
                        <Button key={r} variant={range === r ? "secondary" : "ghost"} size="xs" onClick={() => pickRange(r)}>{r}</Button>
                      ))}
                      {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px] select-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                          <YAxis domain={overviewYDomain ?? ["auto", "auto"]} tickFormatter={overviewAxisFmt} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v) => fmtGBP(Number(v))} />
                          {!hiddenSeries.has("total") && <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" fill="#ffffff" fillOpacity={0.08} strokeWidth={2.5} dot={false} />}
                          {overviewSeries.filter((s) => !hiddenSeries.has(s.pid)).map((s) => (
                            <Area key={s.pid} type="monotone" dataKey={s.name} stroke={s.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                          ))}
                          {!hiddenSeries.has("total") && visibleDots.map((d: ChartDot) => (
                            <ReferenceDot key={`${d.date}-${d.symbol}-${d.x}`} x={d.x} y={d.y} r={4} fill={d.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={1} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {shownDots.length > 0 && <div className="flex gap-3 mt-2 text-xs"><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span><span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span></div>}
                    <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                      <button onClick={() => toggleSeries("total")} title={hiddenSeries.has("total") ? "Show Total" : "Hide Total"} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${!hiddenSeries.has("total") ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-white/5 text-zinc-600 hover:text-zinc-400"}`}>
                        <span className="w-3 h-0.5 rounded-full" style={{ background: "#ffffff", opacity: hiddenSeries.has("total") ? 0.3 : 1 }} /> Total
                      </button>
                      {overviewSeries.map((s) => (
                        <button key={s.pid} onClick={() => toggleSeries(s.pid)} title={hiddenSeries.has(s.pid) ? `Show ${s.name}` : `Hide ${s.name}`} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${!hiddenSeries.has(s.pid) ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-white/5 text-zinc-600 hover:text-zinc-400"}`}>
                          <span className="w-3 h-0.5 rounded-full" style={{ background: s.color, opacity: hiddenSeries.has(s.pid) ? 0.3 : 1 }} /> {s.name}
                        </button>
                      ))}
                      {hiddenSeries.size > 0 && (
                        <button onClick={() => setHiddenSeries(new Set())} className="px-2 py-1 rounded-full text-zinc-500 hover:text-white underline underline-offset-2">Show all</button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <AllocationCard
                  allocation={allocation}
                  mode={allocMode}
                  onModeChange={setAllocMode}
                  emptyContent={<div><p className="text-sm text-zinc-500">No holdings</p><p className="mt-1 text-xs text-zinc-600">Create a portfolio and add holdings</p><Button size="sm" className="mt-3" onClick={() => openWizard(null)}><Plus className="h-3.5 w-3.5" />New portfolio</Button></div>}
                />
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

              <section aria-labelledby="portfolio-insights-heading">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                  <div>
                    <h2 id="portfolio-insights-heading" className="text-lg font-semibold text-white">Portfolio insights</h2>
                    <p className="text-xs text-zinc-500 mt-1">A closer look across your entire account</p>
                  </div>
                  <span className="text-xs text-zinc-600">{accountInsights.positions.length} positions tracked</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <Card className="glass-card">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Position momentum</CardTitle>
                      <Activity className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white tabular-nums">{accountInsights.profitableCount} <span className="text-sm font-medium text-zinc-500">gaining</span></div>
                      {accountInsights.profitableCount + accountInsights.losingCount + accountInsights.unchangedCount > 0 ? (
                        <>
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5 mt-3">
                            <span className="bg-emerald-400" style={{ width: `${(accountInsights.profitableCount / (accountInsights.profitableCount + accountInsights.losingCount + accountInsights.unchangedCount)) * 100}%` }} />
                            <span className="bg-red-400" style={{ width: `${(accountInsights.losingCount / (accountInsights.profitableCount + accountInsights.losingCount + accountInsights.unchangedCount)) * 100}%` }} />
                            <span className="bg-zinc-500" style={{ width: `${(accountInsights.unchangedCount / (accountInsights.profitableCount + accountInsights.losingCount + accountInsights.unchangedCount)) * 100}%` }} />
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">{accountInsights.losingCount} falling · {accountInsights.unchangedCount} unchanged</p>
                        </>
                      ) : <p className="text-xs text-zinc-500 mt-2">Add positions with a cost basis to see momentum</p>}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Largest position</CardTitle>
                      <Target className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                      {accountInsights.largest ? (
                        <>
                          <div className="text-2xl font-bold text-white tabular-nums">{fmtGBP(accountInsights.largest.value)}</div>
                          <p className="text-xs text-zinc-500 mt-2 truncate" title={`${accountInsights.largest.holding.symbol} · ${accountInsights.largest.portfolioName}`}>
                            <span className="text-zinc-300">{accountInsights.largest.holding.symbol}</span> · {totalValue > 0 ? `${((accountInsights.largest.value / totalValue) * 100).toFixed(1)}% of account` : "0.0% of account"}
                          </p>
                        </>
                      ) : <p className="text-sm text-zinc-500 mt-1">No positions yet</p>}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Best performer</CardTitle>
                      <Trophy className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                      {accountInsights.bestPerformer ? (
                        <>
                          <div className={`text-2xl font-bold tabular-nums ${accountInsights.bestPerformer.gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPct(accountInsights.bestPerformer.returnPct!)} <span className="text-sm font-medium">{accountInsights.bestPerformer.holding.symbol}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">{fmtGBP(accountInsights.bestPerformer.gain)} overall gain</p>
                        </>
                      ) : <p className="text-sm text-zinc-500 mt-1">No cost basis data yet</p>}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-xs tracking-widest uppercase text-zinc-500 font-semibold">Latest price update</CardTitle>
                      <Clock3 className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">{accountInsights.latestRefresh ? fmtRelative(accountInsights.latestRefresh, settings.dateFormat) : "—"}</div>
                      <p className="text-xs text-zinc-500 mt-2">
                        {accountInsights.latestRefresh
                          ? `${accountInsights.refreshedCount} of ${accountInsights.positions.length} positions have a recorded update`
                          : "No price updates recorded yet"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </MainDashboard>
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
                    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
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
                <div className="space-y-1.5"><Label>Sector / asset class</Label><Input placeholder="e.g. Technology, Cash, Bonds, Property" maxLength={48} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /><p className="text-xs text-zinc-600">Used to group this position in sector allocation.</p></div>
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                  <div className="space-y-1.5"><Label>{effectiveIsManual ? "Amount (£) *" : "Shares *"}</Label><Input type="number" placeholder={effectiveIsManual ? "5000" : "10"} value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} className={formErrors.shares?"border-red-500/50":""} />{formErrors.shares && <p className="text-xs text-red-400">{formErrors.shares}</p>}{effectiveIsManual && <p className="text-xs text-zinc-600">Tip: use 1 share × price = total for cash</p>}</div>
                  <div className="space-y-1.5"><Label>{effectiveIsManual ? "Price (per unit) *" : "Avg price (cost) *"}</Label><Input type="number" placeholder={effectiveIsManual ? "1.00" : "150.00"} value={form.avgPrice} onChange={(e) => setForm({ ...form, avgPrice: e.target.value })} className={formErrors.avgPrice?"border-red-500/50":""} />{formErrors.avgPrice && <p className="text-xs text-red-400">{formErrors.avgPrice}</p>}</div>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
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
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20" disabled={confirmPortfolioInput !== confirmPortfolio?.name} onClick={async () => { if (!confirmPortfolio) return; const deletedId = confirmPortfolio.id; await remove(deletedId); if (portfolioFromUrl === deletedId) router.replace("/dashboard"); setConfirmPortfolio(null); toast({title:"Portfolio deleted",variant:"success"}); }}>Delete portfolio</Button>
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
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" onClick={async () => {
                  if (!confirmHolding) return;
                  const id = confirmHolding.id;
                  const wasViewing = holdingViewId === id;
                  await deleteHolding(id);
                  await refreshAllHoldings();
                  setConfirmHolding(null);
                  if (wasViewing) router.replace("/dashboard");
                  toast({ title: "Holding deleted", variant: "success" });
                }}>Delete</Button>
              </div>
            </DialogContent>
          </Dialog>

          <TradeDialog key={`t-${tradeHolding?.id ?? "none"}-${showTrade ? 1 : 0}`} open={showTrade} onOpenChange={setShowTrade} holding={tradeHolding} type={tradeType} onSubmit={handleTrade} />
        </div>
      </main>
    </div>
  );
}

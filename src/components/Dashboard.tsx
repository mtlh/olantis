"use client";
import { usePortfolios, useSnapshots, useAccounts } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Plus, Trash2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const CHART_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#fb7185", "#38bdf8", "#f97316"];
const PORTFOLIO_COLORS: Record<string, string> = { ISA: "#60a5fa", SIPP: "#34d399", GIA: "#f472b6" };
function fmtGBP(n: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n); }
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

export function Dashboard({ user, isDemo }: { user?: any; isDemo?: boolean }) {
  const { accounts, create: createAccount, remove: removeAccount, refresh: refreshAccounts } = useAccounts();
  const { portfolios, create, remove, upsertHolding, deleteHolding, refresh: refreshPortfolios } = usePortfolios();
  const { snapshots, byPortfolio } = useSnapshots(portfolios);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHolding, setShowHolding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "3Y" | "MAX">("1Y");
  const [allocMode, setAllocMode] = useState<"holding" | "account">("holding");
  const active = useMemo(() => portfolios.find((p) => p.id === activeId) ?? null, [portfolios, activeId]);

  const { totalValue, totalCost, totalGain, totalGainPct } = useMemo(() => {
    const v = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0), 0);
    const c = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.avgPrice, 0), 0);
    return { totalValue: v, totalCost: c, totalGain: v - c, totalGainPct: c ? ((v - c) / c) * 100 : 0 };
  }, [portfolios]);

  const rangeCount: Record<string, number> = { "1M": 4, "3M": 13, "6M": 26, "1Y": 52, "3Y": 156, MAX: 999 };
  const filteredSnapshots = useMemo(() => {
    const n = rangeCount[range];
    if (snapshots.length <= n) return snapshots;
    return snapshots.slice(-n);
  }, [snapshots, range]);

  const chartData = useMemo(() => {
    if (filteredSnapshots.length === 0) {
      const today = new Date().toISOString().split("T")[0].slice(5);
      return [{ date: today, total: totalValue }];
    }
    const byPort = byPortfolio;
    const dates = filteredSnapshots.map((s) => s.date);
    return dates.map((d) => {
      const row: any = { date: d.slice(5), total: filteredSnapshots.find((s) => s.date === d)?.value ?? 0 };
      for (const [pid, info] of Object.entries(byPort)) {
        const v = (info as any).data.find((x: any) => x.date === d)?.value;
        if (v != null) row[(info as any).name] = v;
      }
      return row;
    });
  }, [filteredSnapshots, byPortfolio, totalValue]);

  const allocation = useMemo(() => {
    if (allocMode === "account") {
      const total = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0), 0);
      if (!total) return [];
      if (accounts.length === 0) {
        return portfolios.map((p, i) => {
          const v = p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0);
          return { name: p.name, value: v, color: PORTFOLIO_COLORS[p.name] ?? CHART_COLORS[i % CHART_COLORS.length], pct: (v / total) * 100 };
        });
      }
      const byAccount = new Map<string, number>();
      let unassignedVal = 0;
      for (const p of portfolios) {
        const v = p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0);
        if (p.accountId) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? 0) + v);
        else unassignedVal += v;
      }
      const out: any[] = accounts.map((acc, i) => ({ name: acc.name, value: byAccount.get(acc.id) ?? 0, color: CHART_COLORS[i % CHART_COLORS.length], pct: ((byAccount.get(acc.id) ?? 0) / total) * 100 })).filter((x) => x.value > 0);
      if (unassignedVal > 0) out.push({ name: "Unassigned", value: unassignedVal, color: "#71717a", pct: (unassignedVal / total) * 100 });
      return out;
    }
    const holdings = active ? active.holdings : portfolios.flatMap((p) => p.holdings);
    const total = holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
    if (!total) return [];
    return holdings.map((h, i) => ({ name: h.symbol, value: h.shares * h.currentPrice, color: CHART_COLORS[i % CHART_COLORS.length], pct: (h.shares * h.currentPrice / total) * 100 }));
  }, [active, portfolios, allocMode, accounts]);

  const handleCreate = async (name: string, type: "live" | "manual", accountId?: string | null) => {
    await create(name, type, accountId ?? null);
  };
  const handleCreateAccount = async (name: string) => {
    await createAccount(name);
  };
  const handleRemoveAccount = async (id: string) => {
    await removeAccount(id);
    await refreshPortfolios();
  };

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "gain">("value");
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0] });
  const openAdd = () => { setForm({ symbol: "", name: "", shares: "", avgPrice: "", currentPrice: "", purchaseDate: new Date().toISOString().split("T")[0] }); setEditingId(null); setShowHolding(true); };
  const openEdit = (h: any) => { setForm({ symbol: h.symbol, name: h.name, shares: String(h.shares), avgPrice: String(h.avgPrice), currentPrice: String(h.currentPrice), purchaseDate: h.purchaseDate }); setEditingId(h.id); setShowHolding(true); };
  const submit = async () => {
    if (!activeId) return;
    await upsertHolding(activeId, { id: editingId ?? undefined, symbol: form.symbol.toUpperCase().trim(), name: form.name || form.symbol, shares: Number(form.shares), avgPrice: Number(form.avgPrice), currentPrice: Number(form.currentPrice || form.avgPrice), currency: "GBP", purchaseDate: form.purchaseDate });
    setShowHolding(false);
  };

  const activeValue = active ? active.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0) : totalValue;
  const activeCost = active ? active.holdings.reduce((s, h) => s + h.shares * h.avgPrice, 0) : totalCost;
  const activeGain = activeValue - activeCost;
  const activeGainPct = activeCost ? (activeGain / activeCost) * 100 : 0;

  const filteredHoldings = useMemo(() => {
    if (!active) return [];
    let hs = active.holdings.filter((h) => !q || h.symbol.toLowerCase().includes(q.toLowerCase()) || h.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === "value") hs = [...hs].sort((a, b) => b.shares * b.currentPrice - a.shares * a.currentPrice);
    else hs = [...hs].sort((a, b) => (b.shares * b.currentPrice - b.shares * b.avgPrice) - (a.shares * a.currentPrice - a.shares * a.avgPrice));
    return hs;
  }, [active, q, sort]);

  const [confirmPortfolio, setConfirmPortfolio] = useState<null | typeof active>(null);
  const [confirmPortfolioInput, setConfirmPortfolioInput] = useState("");
  const [confirmAccount, setConfirmAccount] = useState<null | (typeof accounts)[number]>(null);
  const [confirmAccountInput, setConfirmAccountInput] = useState("");
  const [confirmHolding, setConfirmHolding] = useState<null | { id: string; symbol: string }>(null);

  return (
    <div className="flex min-h-screen">
      <Sidebar accounts={accounts} portfolios={portfolios} activeId={activeId} onSelect={setActiveId} onCreate={handleCreate} onCreateAccount={handleCreateAccount} isDemo={isDemo} />
      <main className="flex-1 min-w-0">
        <div className="w-full max-w-[1600px] mx-auto px-6 md:px-8 lg:px-10 py-6 md:py-8 space-y-6">
          {active ? (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6 md:p-8">
                <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">{active.name}</h1>
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300 capitalize">{active.type}</Badge>
                      {active.accountId && <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">{accounts.find((a) => a.id === active.accountId)?.name ?? ""}</Badge>}
                    </div>
                    <p className="text-sm mt-2 text-zinc-500">{active.holdings.length} holdings • {active.type} • updated {fmtRelative(Math.max(...active.holdings.map((h) => h.lastRefreshedAt ?? 0), 0) || null)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="bg-white/5 border-white/10" onClick={() => setActiveId(null)}>← Overview</Button>
                    <Button onClick={openAdd}><Plus className="w-4 h-4" /> Add holding</Button>
                    <Button variant="ghost" className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-white/5" onClick={() => { setConfirmPortfolio(active as any); setConfirmPortfolioInput(""); }}><Trash2 className="w-4 h-4" /> Delete</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                  <div className="p-4 rounded-xl bg-white text-black">
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Value</div>
                    <div className="text-2xl font-bold mt-1">{fmtGBP(activeValue)}</div>
                    <div className="text-xs text-zinc-600 mt-1">Cost {fmtGBP(activeCost)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Gain</div>
                    <div className="text-2xl font-bold flex items-center gap-2" style={{ color: activeGain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(activeGain)} <span className="text-sm">{fmtPct(activeGainPct)}</span></div>
                    <div className="text-xs text-zinc-500 mt-1">All time</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Holdings</div>
                    <div className="text-2xl font-bold text-white">{active.holdings.length}</div>
                    <div className="text-xs text-zinc-500 mt-1">Positions</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.06] border border-white/10">
                    <div className="text-[11px] tracking-widest uppercase font-semibold text-zinc-500">Avg cost</div>
                    <div className="text-2xl font-bold text-white">{active.holdings.length ? fmtGBP(activeCost / active.holdings.length) : "—"}</div>
                    <div className="text-xs text-zinc-500 mt-1">Per holding</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <Card className="xl:col-span-3 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Performance</CardTitle>
                      <CardDescription>{chartData.length} points • {active.name}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {(["1M", "3M", "6M", "1Y", "3Y", "MAX"] as const).map((r) => (
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
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v: any) => fmtGBP(Number(v))} />
                          <Area type="monotone" dataKey="total" name={active.name} stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.14} strokeWidth={2.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
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
                    {allocation.length === 0 ? <p className="text-sm text-zinc-500 py-10 text-center">No holdings</p> : (
                      <div className="flex gap-4">
                        <div className="w-40 h-40 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} stroke="none">
                                {allocation.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
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
                <CardHeader className="flex flex-row items-center gap-3 border-b border-white/5">
                  <CardTitle className="flex-1 text-white">Holdings</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-44 pl-8 h-8 bg-white/5 border-white/10 text-xs" />
                  </div>
                  <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                    <SelectTrigger className="w-28 h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="value">Value</SelectItem><SelectItem value="gain">Gain</SelectItem></SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredHoldings.length === 0 ? (
                    <div className="p-12 text-center"><p className="text-sm text-zinc-500">No holdings found.</p><Button className="mt-4" onClick={openAdd}><Plus className="w-4 h-4" /> Add holding</Button></div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-zinc-500">Asset</TableHead>
                          <TableHead className="text-zinc-500">Shares • Avg</TableHead>
                          <TableHead className="text-right text-zinc-500">Value</TableHead>
                          <TableHead className="text-right text-zinc-500">Return</TableHead>
                          <TableHead className="text-right text-zinc-500">Updated</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredHoldings.map((h) => {
                          const val = h.shares * h.currentPrice; const cost = h.shares * h.avgPrice; const pct = cost ? ((val - cost) / cost) * 100 : 0;
                          return (
                            <TableRow key={h.id} className="border-white/5 hover:bg-white/[0.04]">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl grid place-items-center font-bold text-xs bg-white/10 border border-white/10 text-white">{h.symbol.slice(0, 3)}</div>
                                  <div><div className="font-medium text-sm text-white">{h.symbol}</div><div className="text-xs text-zinc-500">{h.name}</div></div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-zinc-400">{h.shares} × {fmtGBP(h.avgPrice)}</TableCell>
                              <TableCell className="text-right font-semibold text-white tabular-nums">{fmtGBP(val)}</TableCell>
                              <TableCell className="text-right"><Badge variant="outline" className="border-white/10" style={{ color: pct >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(pct)}</Badge></TableCell>
                              <TableCell className="text-right text-xs text-zinc-500 tabular-nums" title={h.lastRefreshedAt ? new Date(h.lastRefreshedAt * 1000).toLocaleString() : "Never refreshed (cron runs daily 06:00 UTC)"}>{fmtRelative(h.lastRefreshedAt)}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon-xs" onClick={() => openEdit(h)}><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon-xs" className="text-zinc-500 hover:text-red-400" onClick={() => setConfirmHolding({ id: h.id, symbol: h.symbol })}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
                  <p className="text-sm mt-1 text-zinc-500">{accounts.length} accounts • {portfolios.length} portfolios</p>
                  <p className="text-xs mt-1 text-zinc-600">Last snapshot {filteredSnapshots[filteredSnapshots.length - 1]?.date ?? "—"} • {portfolios.length === 0 && <><span className="mx-1">•</span> <Button variant="link" size="xs" className="h-auto p-0 text-xs" onClick={async () => { await handleCreate("ISA", "live", accounts[0]?.id ?? null); }}>Create first portfolio</Button></>}</p>
                </div>
              </div>

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

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-2 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Value over time</CardTitle>
                      <CardDescription>Overall + per-portfolio • {chartData.length} points • {range}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {(["1M", "3M", "6M", "1Y", "3Y", "MAX"] as const).map((r) => (
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
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(v: any) => fmtGBP(Number(v))} />
                          <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" fill="#ffffff" fillOpacity={0.08} strokeWidth={2.5} dot={false} />
                          {Object.entries(byPortfolio).map(([pid, info]: any, i) => (
                            <Area key={pid} type="monotone" dataKey={(info as any).name} stroke={PORTFOLIO_COLORS[(info as any).name] ?? CHART_COLORS[i % CHART_COLORS.length]} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs">
                      <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-3 h-0.5 bg-white" /> Total</span>
                      {Object.values(byPortfolio).map((info: any, i) => (
                        <span key={info.name} className="flex items-center gap-1.5 text-zinc-500"><span className="w-3 h-0.5" style={{ background: PORTFOLIO_COLORS[info.name] ?? CHART_COLORS[i % CHART_COLORS.length] }} /> {info.name}</span>
                      ))}
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
                    {allocation.length === 0 ? <p className="text-sm text-zinc-500 py-10 text-center">No holdings</p> : (
                      <>
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} stroke="none">
                                {allocation.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
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

              <Card className="glass-card overflow-hidden">
                <CardHeader className="border-b border-white/5"><CardTitle className="text-white">Accounts & portfolios</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {portfolios.length === 0 && accounts.length === 0 ? <div className="p-10 text-center text-sm text-zinc-500">Create an account, then add portfolios from the sidebar.</div> : (
                    <div className="divide-y divide-white/5">
                      {accounts.map((acc) => {
                        const ps = portfolios.filter((p) => p.accountId === acc.id);
                        const accVal = ps.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0), 0);
                        return (
                          <div key={acc.id} className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-white">{acc.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-zinc-400">{fmtGBP(accVal)} • {ps.length} portfolios</span>
                                <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400 hover:bg-red-500/10" onClick={() => { setConfirmAccount(acc); setConfirmAccountInput(""); }} aria-label="Delete account"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                            {ps.length === 0 ? <p className="text-xs text-zinc-600">No portfolios in this account.</p> : (
                              <div className="grid md:grid-cols-2 gap-3">
                                {ps.map((p) => {
                                  const v = p.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
                                  const c = p.holdings.reduce((s, h) => s + h.shares * h.avgPrice, 0);
                                  const pct = c ? ((v - c) / c) * 100 : 0;
                                  return (
                                    <button key={p.id} onClick={() => setActiveId(p.id)} className="text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex flex-col gap-2 cursor-pointer">
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium text-white text-sm">{p.name}</span>
                                        <Badge variant="outline" className="capitalize border-white/10 text-zinc-400 text-xs">{p.type}</Badge>
                                      </div>
                                      <div className="text-xl font-bold text-white">{fmtGBP(v)}</div>
                                      <div className="flex items-center gap-2 text-xs"><span className="text-zinc-500">{p.holdings.length} holdings</span><span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{fmtPct(pct)}</span></div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {portfolios.filter((p) => !p.accountId).length > 0 && (
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-zinc-400">Unassigned</span>
                            <span className="text-sm text-zinc-500">{portfolios.filter((p) => !p.accountId).length} portfolios</span>
                          </div>
                          <div className="grid md:grid-cols-2 gap-3">
                            {portfolios.filter((p) => !p.accountId).map((p) => {
                              const v = p.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
                              const c = p.holdings.reduce((s, h) => s + h.shares * h.avgPrice, 0);
                              const pct = c ? ((v - c) / c) * 100 : 0;
                              return (
                                <button key={p.id} onClick={() => setActiveId(p.id)} className="text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex flex-col gap-2 cursor-pointer">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-white text-sm">{p.name}</span>
                                    <Badge variant="outline" className="capitalize border-white/10 text-zinc-400 text-xs">{p.type}</Badge>
                                  </div>
                                  <div className="text-xl font-bold text-white">{fmtGBP(v)}</div>
                                  <div className="flex items-center gap-2 text-xs"><span className="text-zinc-500">{p.holdings.length} holdings</span><span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{fmtPct(pct)}</span></div>
                                </button>
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
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>{editingId ? "Edit holding" : "Add holding"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Symbol</Label><Input placeholder="AAPL" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} /></div>
                  <div className="space-y-2"><Label>Shares</Label><Input type="number" placeholder="10" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Name</Label><Input placeholder="Apple Inc" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Avg price</Label><Input type="number" placeholder="150" value={form.avgPrice} onChange={(e) => setForm({ ...form, avgPrice: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Current price</Label><Input type="number" placeholder="175" value={form.currentPrice} onChange={(e) => setForm({ ...form, currentPrice: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Purchase date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setShowHolding(false)}>Cancel</Button>
                <Button onClick={submit}>Save</Button>
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
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20" disabled={confirmPortfolioInput !== confirmPortfolio?.name} onClick={async () => { if (!confirmPortfolio) return; await remove(confirmPortfolio.id); setActiveId(null); setConfirmPortfolio(null); }}>Delete portfolio</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!confirmAccount} onOpenChange={(o) => !o && setConfirmAccount(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete account</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">This will permanently delete account <span className="text-white font-medium">{confirmAccount?.name}</span> and its {portfolios.filter((p) => p.accountId === confirmAccount?.id).length} portfolios. This cannot be undone.</p>
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

          <Dialog open={!!confirmHolding} onOpenChange={(o) => !o && setConfirmHolding(null)}>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader><DialogTitle>Delete holding</DialogTitle></DialogHeader>
              <p className="text-sm text-zinc-400">Delete <span className="text-white font-medium">{confirmHolding?.symbol}</span>? This cannot be undone.</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmHolding(null)}>Cancel</Button>
                <Button variant="ghost" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" onClick={async () => { if (!confirmHolding || !active) return; await deleteHolding(active.id, confirmHolding.id); setConfirmHolding(null); }}>Delete</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}

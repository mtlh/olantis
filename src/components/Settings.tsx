"use client";
import { useAccounts, useProviders, usePortfolios } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Palette, Building2, Briefcase, Folder, Trash2, Download, Upload, Shield, Clock, Image as ImageIcon, Sparkles, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { PALETTE, tintColor, portfolioTint } from "@/lib/colors";

interface SettingsState {
  currency: string | null;
  dateFormat: string | null;
  defaultRange: string | null;
  showTradeMarkers: number | null;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  return rows;
}

function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`w-8 h-8 rounded-full border-2 transition-all ${active ? "border-white scale-110 shadow-lg" : "border-white/10 hover:border-white/30"}`} style={{ background: color }} aria-label={color} />
  );
}

export function SettingsView({ isDemo }: { isDemo?: boolean }) {
  const { accounts, setColor: setAccountColor, refresh: refreshAccounts } = useAccounts();
  const { providers, setColor: setProviderColor, refresh: refreshProviders } = useProviders();
  const { portfolios, setColor: setPortfolioColor, refresh: refreshPortfolios } = usePortfolios();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>({ currency: "GBP", dateFormat: "en-GB", defaultRange: "1Y", showTradeMarkers: 1 });
  const [saving, setSaving] = useState<string | null>(null);
  const [colorTab, setColorTab] = useState<"accounts" | "providers" | "portfolios">("accounts");
  const [importPortfolioId, setImportPortfolioId] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/api/settings").then(r=>r.json()).then(j=>{ if(!cancel) setSettings((s)=>({ ...s, ...j })); }).catch(()=>{});
    return () => { cancel = true; };
  }, []);

  const saveSettings = async (patch: Partial<SettingsState>) => {
    const prev = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.text()) || `Save failed (${res.status})`);
      toast({ title: "Settings saved", variant: "success" });
    } catch (e: unknown){ setSettings(prev); toast({title:"Save failed", description: e instanceof Error ? e.message : String(e), variant:"error"}); }
  };

  const handleAccountColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setAccountColor(id, color); toast({ title: "Account color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handleProviderColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setProviderColor(id, color); toast({ title: "Provider color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handlePortfolioColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setPortfolioColor(id, color); toast({ title: "Portfolio color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };

  const handleReorder = async (table: string, ids: string[]) => {
    try {
      const res = await fetch("/api/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, ids }) });
      if (!res.ok) throw new Error((await res.text()) || `Reorder failed (${res.status})`);
      if (table === "accounts") await refreshAccounts();
      else if (table === "providers") await refreshProviders();
      else if (table === "portfolios") await refreshPortfolios();
      toast({ title: "Order updated", variant: "success" });
    } catch (e: unknown) { toast({ title: "Reorder failed", description: e instanceof Error ? e.message : String(e), variant: "error" }); }
  };

  const moveItem = (table: string, list: { id: string }[], index: number, dir: -1 | 1) => {
    const ids = list.map(x => x.id);
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[index], ids[newIdx]] = [ids[newIdx], ids[index]];
    handleReorder(table, ids);
  };

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)), [accounts]);
  const providersByAccount = useMemo(() => {
    const m = new Map<string, typeof providers>();
    for (const pr of providers) { const arr = m.get(pr.accountId) ?? []; arr.push(pr); m.set(pr.accountId, arr); }
    for (const [, arr] of m) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return m;
  }, [providers]);
  const { portfoliosByProvider, portfoliosByAccount, unassignedPortfolios } = useMemo(() => {
    const byProvider = new Map<string, typeof portfolios>();
    const byAccount = new Map<string, typeof portfolios>();
    const unassigned: typeof portfolios = [];
    for (const p of portfolios) {
      if (p.providerId) { const arr = byProvider.get(p.providerId) ?? []; arr.push(p); byProvider.set(p.providerId, arr); }
      else if (p.accountId) { const arr = byAccount.get(p.accountId) ?? []; arr.push(p); byAccount.set(p.accountId, arr); }
      else { unassigned.push(p); }
    }
    for (const [, arr] of byProvider) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    for (const [, arr] of byAccount) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    unassigned.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return { portfoliosByProvider: byProvider, portfoliosByAccount: byAccount, unassignedPortfolios: unassigned };
  }, [portfolios]);

  const exportAll = async () => {
    const data = { accounts, providers, portfolios, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `olantis-export-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center hover:bg-white/10"><ArrowLeft className="w-4 h-4"/></Link>
            <div><h1 className="text-lg font-semibold tracking-tight">Settings</h1><p className="text-xs text-zinc-500">Manage colors, preferences & data</p></div>
          </div>
          <Badge variant="outline" className="border-white/10 text-zinc-400 hidden sm:inline-flex"><Sparkles className="w-3 h-3"/> Personalize everything</Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Card className="glass-card border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><Palette className="w-5 h-5"/> Color mapping</CardTitle>
            <CardDescription>Assign a base color per account. Providers & portfolios inherit as tints — override anytime. Colors appear in sidebar & charts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/5 w-fit">
              {([
                { key: "accounts" as const, label: "Accounts", icon: Building2, count: accounts.length },
                { key: "providers" as const, label: "Providers", icon: Briefcase, count: providers.length },
                { key: "portfolios" as const, label: "Portfolios", icon: Folder, count: portfolios.length },
              ]).map(({ key, label, icon: Icon, count }) => (
                <button key={key} onClick={() => setColorTab(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${colorTab === key ? "bg-white text-black shadow" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colorTab === key ? "bg-black/10 text-black/60" : "bg-white/10 text-zinc-500"}`}>{count}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              {colorTab === "accounts" ? "Base colors — providers & portfolios inherit tints from these." : colorTab === "providers" ? "Inherit their account's color as a tint, or override with a fixed color." : "Auto-tint from the parent color, or pin a fixed color."}
            </p>

            {colorTab === "accounts" && (
              accounts.length===0 ? <p className="text-sm text-zinc-500">No accounts yet. Create one from the sidebar.</p> : (
                <div className="space-y-3">
                  {accounts.map((acc, ai) => {
                    const base = acc.color || PALETTE[ai % PALETTE.length].value;
                    return (
                      <div key={acc.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.03] flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full" style={{ background: base }} />
                            <span className="text-sm font-medium text-white">{acc.name}</span>
                            <span className="text-xs text-zinc-600 hidden sm:inline">Account</span>
                          </div>
                          {acc.color && <Button variant="ghost" size="xs" className="text-zinc-500" onClick={()=>handleAccountColor(acc.id, null)} disabled={saving===acc.id}>Reset</Button>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {PALETTE.map(c=> <Swatch key={c.value} color={c.value} active={acc.color===c.value} onClick={()=>handleAccountColor(acc.id, c.value)} />)}
                          <div className="ml-2 pl-3 border-l border-white/10 flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Tint preview:</span>
                            <div className="flex gap-1">
                              {[0,0.18,-0.18,0.32].map((t,i)=> <span key={i} className="w-6 h-6 rounded-full border border-white/10" style={{ background: tintColor(base, t) }} title={`Tint ${t>0?"+":""}${t}`} />)}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-600">Portfolios in this account will auto-tint from this base unless overridden.</div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {colorTab === "providers" && (
              providers.length===0 ? <p className="text-sm text-zinc-500">No providers yet. Add one inside an account.</p> : (
                <div className="space-y-3">
                  {providers.map((pr)=>{
                    const acc = accounts.find(a=>a.id===pr.accountId);
                    const base = pr.color || acc?.color || PALETTE[0].value;
                    return (
                      <div key={pr.id} className="p-4 rounded-xl border border-white/5 bg-black/20 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: base }} />
                            <span className="text-sm text-white font-medium">{pr.name}</span>
                            <Badge variant="outline" className="text-[11px] border-white/10 text-zinc-500">{acc?.name ?? "—"}</Badge>
                          </div>
                          <div className="flex gap-1">
                            {pr.color && <Button variant="ghost" size="xs" onClick={()=>handleProviderColor(pr.id, null)} disabled={saving===pr.id}>Auto</Button>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={()=>handleProviderColor(pr.id, null)} className={`px-3 py-1.5 rounded-full text-xs border ${!pr.color ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10"}`}>Auto tint of {acc?.name ?? "account"}</button>
                          {PALETTE.map(c=> <Swatch key={c.value} color={c.value} active={pr.color===c.value} onClick={()=>handleProviderColor(pr.id, c.value)} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {colorTab === "portfolios" && (
              portfolios.length===0 ? <p className="text-sm text-zinc-500">No portfolios yet.</p> : (
                <div className="space-y-3">
                  {portfolios.map((p, pi)=>{
                    const prov = providers.find(pr=> pr.id===p.providerId);
                    const acc = accounts.find(a=>a.id===p.accountId) ?? (prov ? accounts.find(a=>a.id===prov.accountId) : null);
                    const base = p.color || prov?.color || acc?.color || PALETTE[pi % PALETTE.length].value;
                    const inherited = !p.color;
                    const tinted = inherited ? portfolioTint(prov?.color || acc?.color || null, pi) : base;
                    return (
                      <div key={p.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col gap-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: tinted }} />
                            <span className="text-sm font-medium text-white">{p.name}</span>
                            <Badge variant="outline" className="border-white/10 text-zinc-500 text-[11px] capitalize">{p.type}</Badge>
                            <span className="text-xs text-zinc-600 hidden md:inline">{acc?.name ?? "Unassigned"} {prov ? `› ${prov.name}` : ""}</span>
                            {inherited && <Badge variant="outline" className="border-amber-500/20 text-amber-300 text-[11px] bg-amber-500/10">Auto tint</Badge>}
                          </div>
                          {!p.color ? null : <Button variant="ghost" size="xs" onClick={()=>handlePortfolioColor(p.id, null)} disabled={saving===p.id}>Auto</Button>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <button onClick={()=>handlePortfolioColor(p.id, null)} className={`px-3 py-1 rounded-full text-xs border ${!p.color ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-zinc-400"}`}>Auto tint</button>
                          {PALETTE.map(c=> <Swatch key={c.value} color={c.value} active={p.color===c.value} onClick={()=>handlePortfolioColor(p.id, c.value)} />)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          <span className="w-16">Preview:</span>
                          <div className="h-2 flex-1 rounded-full overflow-hidden flex">
                            {[0,0.18,-0.18].map((t,i)=> <div key={i} className="flex-1" style={{ background: tintColor(base, t) }} />)}
                          </div>
                          <span className="hidden sm:inline">Used in sidebar & charts</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-400">
              <Palette className="w-4 h-4 shrink-0"/> Colors sync instantly — sidebar dots, provider headers, allocation pie & performance lines all use the same mapping. Auto tints generate lighter/darker variants so portfolios stay distinct but on-brand.
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><ArrowUpDown className="w-5 h-5"/> Sidebar order</CardTitle>
            <CardDescription>Choose the display order for accounts, providers and portfolios in the sidebar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sortedAccounts.length === 0 && providers.length === 0 && portfolios.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing to reorder yet.</p>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-zinc-500"/> Accounts</h3>
                  {sortedAccounts.length === 0 ? <p className="text-xs text-zinc-500">No accounts</p> : (
                    <div className="space-y-1">
                      {sortedAccounts.map((acc, i) => (
                        <div key={acc.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: acc.color || PALETTE[i % PALETTE.length].value }} />
                          <span className="flex-1 text-sm text-white truncate">{acc.name}</span>
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${acc.name} up`} disabled={i === 0} onClick={() => moveItem("accounts", sortedAccounts, i, -1)}><ChevronUp className="w-3.5 h-3.5"/></Button>
                            <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${acc.name} down`} disabled={i === sortedAccounts.length - 1} onClick={() => moveItem("accounts", sortedAccounts, i, 1)}><ChevronDown className="w-3.5 h-3.5"/></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-px bg-white/5" />

                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Briefcase className="w-4 h-4 text-zinc-500"/> Providers</h3>
                  {providers.length === 0 ? <p className="text-xs text-zinc-500">No providers</p> : sortedAccounts.map(acc => {
                    const provs = providersByAccount.get(acc.id) ?? [];
                    if (provs.length === 0) return null;
                    return (
                      <div key={acc.id} className="mb-3">
                        <div className="text-[11px] text-zinc-500 mb-1 ml-1">{acc.name}</div>
                        <div className="space-y-1">
                          {provs.map((pr, i) => (
                            <div key={pr.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pr.color || acc.color || PALETTE[0].value }} />
                              <span className="flex-1 text-sm text-white truncate">{pr.name}</span>
                              <div className="flex gap-0.5">
                                <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${pr.name} up`} disabled={i === 0} onClick={() => moveItem("providers", provs, i, -1)}><ChevronUp className="w-3.5 h-3.5"/></Button>
                                <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${pr.name} down`} disabled={i === provs.length - 1} onClick={() => moveItem("providers", provs, i, 1)}><ChevronDown className="w-3.5 h-3.5"/></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-white/5" />

                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Folder className="w-4 h-4 text-zinc-500"/> Portfolios</h3>
                  {portfolios.length === 0 ? <p className="text-xs text-zinc-500">No portfolios</p> : (
                    <div className="space-y-4">
                      {sortedAccounts.map(acc => {
                        const provs = providersByAccount.get(acc.id) ?? [];
                        const directPfs = portfoliosByAccount.get(acc.id) ?? [];
                        const hasContent = provs.some(pr => (portfoliosByProvider.get(pr.id) ?? []).length > 0) || directPfs.length > 0;
                        if (!hasContent) return null;
                        return (
                          <div key={acc.id}>
                            <div className="text-[11px] text-zinc-500 mb-1 ml-1 flex items-center gap-1"><Building2 className="w-3 h-3"/> {acc.name}</div>
                            {provs.map(pr => {
                              const pfs = portfoliosByProvider.get(pr.id) ?? [];
                              if (pfs.length === 0) return null;
                              return (
                                <div key={pr.id} className="ml-3 mb-2">
                                  <div className="text-[11px] text-zinc-600 mb-1 ml-1">{pr.name}</div>
                                  <div className="space-y-1">
                                    {pfs.map((p, i) => (
                                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || pr.color || acc.color || PALETTE[0].value }} />
                                        <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                                        <span className="text-[10px] text-zinc-600 capitalize">{p.type}</span>
                                        <div className="flex gap-0.5">
                                          <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => moveItem("portfolios", pfs, i, -1)}><ChevronUp className="w-3.5 h-3.5"/></Button>
                                          <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} down`} disabled={i === pfs.length - 1} onClick={() => moveItem("portfolios", pfs, i, 1)}><ChevronDown className="w-3.5 h-3.5"/></Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                            {directPfs.length > 0 && (
                              <div className="ml-3 mb-2">
                                <div className="text-[11px] text-zinc-600 mb-1 ml-1">Direct</div>
                                <div className="space-y-1">
                                  {directPfs.map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || acc.color || PALETTE[0].value }} />
                                      <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                                      <span className="text-[10px] text-zinc-600 capitalize">{p.type}</span>
                                      <div className="flex gap-0.5">
                                        <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => moveItem("portfolios", directPfs, i, -1)}><ChevronUp className="w-3.5 h-3.5"/></Button>
                                        <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} down`} disabled={i === directPfs.length - 1} onClick={() => moveItem("portfolios", directPfs, i, 1)}><ChevronDown className="w-3.5 h-3.5"/></Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {unassignedPortfolios.length > 0 && (
                        <div>
                          <div className="text-[11px] text-zinc-500 mb-1 ml-1">Unassigned</div>
                          <div className="space-y-1">
                            {unassignedPortfolios.map((p, i) => (
                              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || PALETTE[0].value }} />
                                <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                                <span className="text-[10px] text-zinc-600 capitalize">{p.type}</span>
                                <div className="flex gap-0.5">
                                  <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => moveItem("portfolios", unassignedPortfolios, i, -1)}><ChevronUp className="w-3.5 h-3.5"/></Button>
                                  <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Move ${p.name} down`} disabled={i === unassignedPortfolios.length - 1} onClick={() => moveItem("portfolios", unassignedPortfolios, i, 1)}><ChevronDown className="w-3.5 h-3.5"/></Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Clock className="w-4 h-4"/> Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default currency</Label>
                <Select value={settings.currency ?? "GBP"} onValueChange={v=> saveSettings({ currency: v })}>
                  <SelectTrigger><span className="flex-1 text-left truncate">{settings.currency ?? "GBP"}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">Applied to new holdings and trades. Existing holdings keep the currency they were recorded with.</p>
              </div>
              <div className="space-y-2">
                <Label>Date format</Label>
                <Select value={settings.dateFormat ?? "en-GB"} onValueChange={v=> saveSettings({ dateFormat: v })}>
                  <SelectTrigger><span className="flex-1 text-left truncate">{settings.dateFormat ?? "en-GB"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="en-GB">Day / month / year</SelectItem><SelectItem value="en-US">Month / day / year</SelectItem><SelectItem value="de-DE">Day.month.year</SelectItem><SelectItem value="fr-FR">Day / month / year (French)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default chart range</Label>
                <Select value={settings.defaultRange ?? "1Y"} onValueChange={v=> saveSettings({ defaultRange: v })}>
                  <SelectTrigger><span className="flex-1 text-left truncate">{settings.defaultRange ?? "1Y"}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1M">1M</SelectItem>
                    <SelectItem value="3M">3M</SelectItem>
                    <SelectItem value="1Y">1Y</SelectItem>
                    <SelectItem value="MAX">MAX</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">Range every chart opens on. You can still switch per chart.</p>
              </div>
              <div className="space-y-2">
                <Label>Show trade markers on charts</Label>
                <Select value={String(settings.showTradeMarkers ?? 1)} onValueChange={v=> saveSettings({ showTradeMarkers: Number(v) })}>
                  <SelectTrigger><span className="flex-1 text-left truncate">{Number(settings.showTradeMarkers ?? 1) ? "On" : "Off"}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">On — green buy / red sell dots</SelectItem>
                    <SelectItem value="0">Off</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">Applies to portfolio and single-stock charts.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Shield className="w-4 h-4"/> Data & privacy</CardTitle>
              <CardDescription>Export, import & danger zone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start gap-2 bg-white/5 border-white/10" onClick={exportAll}><Download className="w-4 h-4"/> Export all as JSON</Button>
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <Label htmlFor="import-portfolio">Import CSV into portfolio</Label>
                <Select value={importPortfolioId} onValueChange={(value) => setImportPortfolioId(value ?? "")}>
                  <SelectTrigger id="import-portfolio"><span className="flex-1 text-left truncate">{portfolios.find((p) => p.id === importPortfolioId)?.name ?? "Choose portfolio"}</span></SelectTrigger>
                  <SelectContent>{portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <input
                  id="import-csv"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={importing || !importPortfolioId}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !importPortfolioId) return;
                    setImporting(true);
                    try {
                      const text = await file.text();
                      const lines = parseCsv(text);
                      if (lines.length < 2) throw new Error("CSV must contain a header and at least one data row");
                      const headers = lines[0].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                      const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
                      const field = (row: string[], ...names: string[]) => row[index(...names)]?.trim() ?? "";
                      let imported = 0;
                      for (const [rowIndex, row] of lines.slice(1).entries()) {
                        if (row.every((cell) => !cell.trim())) continue;
                        const type = field(row, "type", "transactiontype").toLowerCase();
                        const symbol = field(row, "symbol", "ticker").toUpperCase();
                        const shares = Number(field(row, "shares", "quantity", "qty"));
                        const date = field(row, "date", "purchasedate", "tradedate") || new Date().toISOString().slice(0, 10);
                        if (!symbol || !Number.isFinite(shares) || shares <= 0) throw new Error(`Row ${rowIndex + 2}: symbol and positive shares/quantity are required`);
                        let response: Response;
                        if (type === "buy" || type === "sell") {
                          const price = Number(field(row, "price", "pricepershare", "unitprice"));
                          if (!Number.isFinite(price) || price <= 0) throw new Error(`Row ${rowIndex + 2}: positive price is required for a trade`);
                          response = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: importPortfolioId, symbol, name: field(row, "name", "description") || symbol, type, shares, price, date, currency: field(row, "currency") || "GBP" }) });
                        } else {
                          const avgPrice = Number(field(row, "avgprice", "averageprice", "costbasis", "pricepershare"));
                          const currentPriceRaw = field(row, "currentprice", "marketprice");
                          const currentPrice = currentPriceRaw ? Number(currentPriceRaw) : avgPrice;
                          if (!Number.isFinite(avgPrice) || avgPrice <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error(`Row ${rowIndex + 2}: positive AvgPrice (and CurrentPrice, if supplied) are required`);
                          response = await fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: importPortfolioId, symbol, name: field(row, "name", "description") || symbol, shares, avgPrice, currentPrice, currency: field(row, "currency") || "GBP", sector: field(row, "sector", "assetclass"), purchaseDate: date, exchange: field(row, "exchange") || undefined }) });
                        }
                        if (!response.ok) throw new Error(`Row ${rowIndex + 2}: ${(await response.text()).slice(0, 240)}`);
                        imported++;
                      }
                      await refreshPortfolios();
                      toast({ title: "CSV import complete", description: `${imported} rows imported into ${portfolios.find((p) => p.id === importPortfolioId)?.name ?? "portfolio"}.`, variant: "success" });
                    } catch (error) {
                      toast({ title: "CSV import stopped", description: error instanceof Error ? error.message : String(error), variant: "error" });
                    } finally { setImporting(false); }
                  }}
                />
                <Button variant="outline" className="w-full justify-start gap-2 bg-white/5 border-white/10" disabled={importing || !importPortfolioId} onClick={() => document.getElementById("import-csv")?.click()}><Upload className="w-4 h-4"/>{importing ? "Importing…" : "Import holdings or buy/sell CSV"}</Button>
                <p className="text-xs text-zinc-600">Holdings: Symbol, Name, Shares, AvgPrice, CurrentPrice, Currency. Trades: Symbol, Type, Shares, Price, Date.</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
              <Button variant="outline" className="w-full justify-start gap-2 bg-white/5 border-white/10" onClick={()=> { window.location.href="/api/demo"; }} disabled={isDemo}><Upload className="w-4 h-4"/> Load demo data</Button>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="text-sm font-medium text-red-300 flex items-center gap-2"><Trash2 className="w-4 h-4"/> Danger zone</div>
                <p className="text-xs text-red-300/70 mt-1">Delete all portfolios and holdings. Accounts & providers remain. Cannot be undone.</p>
                <Button variant="ghost" size="sm" className="mt-2 bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/20" onClick={async()=>{
                  if(!confirm("Delete ALL portfolios?")) return;
                  for(const p of portfolios){ await fetch(`/api/portfolios?id=${p.id}`, { method:"DELETE" }); }
                  location.reload();
                }}><Trash2 className="w-3.5 h-3.5"/> Delete all portfolios</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><ImageIcon className="w-4 h-4"/> Theme</CardTitle>
            <CardDescription>Black glass + grey cards. Color is reserved only for data — your mapping above.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PALETTE.map(c=> (
              <div key={c.value} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ background: c.value }} /> {c.label}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-zinc-600">
          Olantis • Your portfolios, beautifully simple. <Link href="/dashboard" className="underline hover:text-zinc-400">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}

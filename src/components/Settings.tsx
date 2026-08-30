"use client";
import { useAccounts, useProviders, usePortfolios } from "@/lib/store";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Palette, Building2, Briefcase, Folder, Trash2, Download, Upload, Shield, Clock, Image as ImageIcon, Sparkles } from "lucide-react";
import Link from "next/link";

export const PALETTE = [
  { id: "blue", label: "Blue", value: "#60a5fa" },
  { id: "emerald", label: "Emerald", value: "#34d399" },
  { id: "pink", label: "Pink", value: "#f472b6" },
  { id: "amber", label: "Amber", value: "#facc15" },
  { id: "violet", label: "Violet", value: "#a78bfa" },
  { id: "red", label: "Rose", value: "#fb7185" },
  { id: "sky", label: "Sky", value: "#38bdf8" },
  { id: "orange", label: "Orange", value: "#f97316" },
  { id: "teal", label: "Teal", value: "#2dd4bf" },
  { id: "indigo", label: "Indigo", value: "#818cf8" },
  { id: "lime", label: "Lime", value: "#84cc16" },
  { id: "zinc", label: "Zinc", value: "#71717a" },
] as const;

export function tintColor(hex: string, amount: number) {
  try {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.round(Math.min(255, Math.max(0, r + amount * 255)));
    g = Math.round(Math.min(255, Math.max(0, g + amount * 255)));
    b = Math.round(Math.min(255, Math.max(0, b + amount * 255)));
    return `rgb(${r}, ${g}, ${b})`;
  } catch { return hex; }
}

function portfolioTint(base: string | null | undefined, index: number, total: number) {
  if (!base) return PALETTE[index % PALETTE.length].value;
  const steps = [0, 0.18, -0.18, 0.32, -0.32];
  return tintColor(base, steps[index % steps.length]);
}

function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`w-8 h-8 rounded-full border-2 transition-all ${active ? "border-white scale-110 shadow-lg" : "border-white/10 hover:border-white/30"}`} style={{ background: color }} aria-label={color} />
  );
}

export function SettingsView({ isDemo }: { isDemo?: boolean }) {
  const { accounts, setColor: setAccountColor } = useAccounts();
  const { providers, setColor: setProviderColor } = useProviders();
  const { portfolios, setColor: setPortfolioColor } = usePortfolios();
  const { toast } = useToast();
  const [settings, setSettings] = useState<any>({ currency: "GBP", defaultRange: "1Y", showTradeMarkers: 1 });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then(r=>r.json()).then(j=> setSettings((s:any)=>({ ...s, ...j }))).catch(()=>{});
  }, []);

  const saveSettings = async (patch: any) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try { await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); toast({ title: "Settings saved", variant: "success" }); } catch (e:any){ toast({title:"Save failed", description:String(e.message||e), variant:"error"}); }
  };

  const handleAccountColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setAccountColor(id, color); toast({ title: "Account color updated", variant: "success" }); } catch (e:any){ toast({title:"Failed", description:String(e.message||e), variant:"error"});} finally{ setSaving(null); }
  };
  const handleProviderColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setProviderColor(id, color); toast({ title: "Provider color updated", variant: "success" }); } catch (e:any){ toast({title:"Failed", description:String(e.message||e), variant:"error"});} finally{ setSaving(null); }
  };
  const handlePortfolioColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setPortfolioColor(id, color); toast({ title: "Portfolio color updated", variant: "success" }); } catch (e:any){ toast({title:"Failed", description:String(e.message||e), variant:"error"});} finally{ setSaving(null); }
  };

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
          <CardContent className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-zinc-500"/> Accounts — base colors</h3>
              {accounts.length===0 ? <p className="text-sm text-zinc-500">No accounts yet. Create one from the sidebar.</p> : (
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
              )}
            </div>

            <div className="h-px bg-white/5" />

            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Briefcase className="w-4 h-4 text-zinc-500"/> Providers — inherit or override</h3>
              {providers.length===0 ? <p className="text-sm text-zinc-500">No providers yet. Add one inside an account.</p> : (
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
              )}
            </div>

            <div className="h-px bg-white/5" />

            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Folder className="w-4 h-4 text-zinc-500"/> Portfolios — custom or tinted</h3>
              {portfolios.length===0 ? <p className="text-sm text-zinc-500">No portfolios yet.</p> : (
                <div className="space-y-3">
                  {portfolios.map((p, pi)=>{
                    const prov = providers.find(pr=> pr.id===(p as any).providerId);
                    const acc = accounts.find(a=>a.id===p.accountId) ?? (prov ? accounts.find(a=>a.id===prov.accountId) : null);
                    const base = (p as any).color || prov?.color || acc?.color || PALETTE[pi % PALETTE.length].value;
                    const inherited = !(p as any).color;
                    const tinted = inherited ? portfolioTint(prov?.color || acc?.color || null, pi, portfolios.length) : base;
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
                          {!(p as any).color ? null : <Button variant="ghost" size="xs" onClick={()=>handlePortfolioColor(p.id, null)} disabled={saving===p.id}>Auto</Button>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <button onClick={()=>handlePortfolioColor(p.id, null)} className={`px-3 py-1 rounded-full text-xs border ${!(p as any).color ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-zinc-400"}`}>Auto tint</button>
                          {PALETTE.map(c=> <Swatch key={c.value} color={c.value} active={(p as any).color===c.value} onClick={()=>handlePortfolioColor(p.id, c.value)} />)}
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
              )}
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-400">
              <Palette className="w-4 h-4 shrink-0"/> Colors sync instantly — sidebar dots, provider headers, allocation pie & performance lines all use the same mapping. Auto tints generate lighter/darker variants so portfolios stay distinct but on-brand.
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Clock className="w-4 h-4"/> Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Currency display</Label>
                <Select value={settings.currency ?? "GBP"} onValueChange={v=> saveSettings({ currency: v })}>
                  <SelectTrigger><span className="flex-1 text-left truncate">{settings.currency ?? "GBP"}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
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

"use client";
import { Portfolio, Account, Provider, Holding } from "@/lib/store";
import { LayoutDashboard, Plus, Folder, FolderOpen, LogOut, Building2, ChevronDown, Clock, Search, MoreVertical, Pencil, Trash2, X, Menu, Briefcase, Layers, Settings, TrendingUp } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PALETTE, portfolioTint } from "@/lib/colors";
import { fmtRelative, holdingValueGBP, fmtPrice } from "@/lib/format";

interface SearchResult { symbol: string; name: string; exchange: string; price?: number | null; currency?: string | null }

function isLightColor(hex: string) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 180;
  } catch { return false; }
}

export function Sidebar({ accounts, providers, portfolios, holdings, activeId, onSelect, onSelectHolding, onCreateAccount, onCreateProvider, onOpenWizard, onRefresh, isDemo, accountsReady, portfoliosReady, onRenameAccount, onRenameProvider, onRenamePortfolio, onDeleteAccount, onDeleteProvider, onDeletePortfolio }: {
  accounts: Account[]; providers: Provider[]; portfolios: Portfolio[]; holdings?: Holding[]; activeId: string | null; onSelect: (id: string | null) => void; onSelectHolding?: (h: Holding) => void;
  onCreateAccount: (name: string) => void | Promise<void>;
  onCreateProvider?: (name: string, accountId: string) => Promise<void>;
  onOpenWizard: (accountId: string | null, providerId?: string | null) => void;
  onRefresh?: () => Promise<void>;
  isDemo?: boolean; accountsReady?: boolean; portfoliosReady?: boolean;
  onRenameAccount?: (id: string, name: string) => Promise<void>;
  onRenameProvider?: (id: string, name: string) => Promise<void>;
  onRenamePortfolio?: (id: string, patch: { name?: string; type?: string; accountId?: string | null; providerId?: string | null }) => Promise<void>;
  onDeleteAccount?: (a: Account) => void;
  onDeleteProvider?: (p: Provider) => void;
  onDeletePortfolio?: (p: Portfolio) => void;
}) {
  const { toast } = useToast();
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountError, setAccountError] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [editPName, setEditPName] = useState("");
  const [editPType, setEditPType] = useState<"live"|"manual">("live");
  const [editPAccount, setEditPAccount] = useState<string>("__none");
  const [editPProvider, setEditPProvider] = useState<string>("__none");
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [providerAccountId, setProviderAccountId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editProviderName, setEditProviderName] = useState("");
  const [showDirectHolding, setShowDirectHolding] = useState(false);
  const [directTarget, setDirectTarget] = useState<{ accountId?: string | null; providerId?: string | null } | null>(null);
  const [directForm, setDirectForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", exchange: "", currentPrice: "", currency: "GBP" });
  const [editingDirectId, setEditingDirectId] = useState<string | null>(null);
  const [directSaving, setDirectSaving] = useState(false);
  const [directSearchResults, setDirectSearchResults] = useState<SearchResult[]>([]);
  const [directShowMenu, setDirectShowMenu] = useState(false);
  const [directQuery, setDirectQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedProv, setExpandedProv] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortByOrder = <T extends { sortOrder?: number | null }>(list: T[]): T[] => [...list].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

  const unassigned = useMemo(()=> sortByOrder(portfolios.filter(p=> !p.accountId && !p.providerId)), [portfolios]);
  const filteredAccounts = useMemo(()=> sortByOrder(accounts.filter(a=> !q || a.name.toLowerCase().includes(q.toLowerCase()))), [accounts,q]);
  const filteredPortfolios = useMemo(() => (list: Portfolio[]) => sortByOrder(list.filter(p=> !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.holdings.some(h=>h.symbol.toLowerCase().includes(q.toLowerCase())))), [q]);
  const filteredProviders = useMemo(() => (list: Provider[]) => sortByOrder(list.filter(pr=> !q || pr.name.toLowerCase().includes(q.toLowerCase()))), [q]);

  const providersByAccount = useMemo(()=>{
    const m = new Map<string, Provider[]>();
    for(const pr of providers){ const arr=m.get(pr.accountId)??[]; arr.push(pr); m.set(pr.accountId, arr); }
    for (const [, arr] of m) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return m;
  },[providers]);
  const portfoliosByProvider = useMemo(()=>{
    const m = new Map<string, Portfolio[]>();
    for(const p of portfolios){ if(p.providerId){ const arr=m.get(p.providerId)??[]; arr.push(p); m.set(p.providerId, arr); } }
    for (const [, arr] of m) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return m;
  },[portfolios]);
  const directByAccount = useMemo(()=>{
    const m = new Map<string, Portfolio[]>();
    for(const p of portfolios){ if(p.accountId && !p.providerId){ const arr=m.get(p.accountId)??[]; arr.push(p); m.set(p.accountId, arr); } }
    for (const [, arr] of m) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return m;
  },[portfolios]);

  const directHoldings = holdings ?? [];
  const accountIndex = useMemo(() => new Map(accounts.map((a, i) => [a.id, i])), [accounts]);
  const accountTotals = (aid: string) => {
    const direct = directByAccount.get(aid) ?? [];
    const provs = providersByAccount.get(aid) ?? [];
    let sum = direct.reduce((s,p)=> s + p.holdings.reduce((a,h:Holding)=>a+holdingValueGBP(h),0),0);
    for(const pr of provs){ const ps=portfoliosByProvider.get(pr.id)??[]; sum+= ps.reduce((s,p)=>s+p.holdings.reduce((a,h:Holding)=>a+holdingValueGBP(h),0),0); }
    sum += directHoldings.filter((h:Holding)=> h.accountId===aid && !h.providerId && !h.portfolioId).reduce((s,h:Holding)=> s+holdingValueGBP(h),0);
    for(const pr of provs){ sum += directHoldings.filter((h:Holding)=> h.providerId===pr.id).reduce((s,h:Holding)=> s+holdingValueGBP(h),0); }
    return sum;
  };
  const providerTotals = (pid: string) => {
    let sum = (portfoliosByProvider.get(pid)??[]).reduce((s,p)=>s+p.holdings.reduce((a,h:Holding)=>a+holdingValueGBP(h),0),0);
    sum += directHoldings.filter((h:Holding)=> h.providerId===pid).reduce((s,h:Holding)=> s+holdingValueGBP(h),0);
    return sum;
  };
  const accColorFor = (acc: Account) => acc.color || PALETTE[(accountIndex.get(acc.id) ?? 0) % PALETTE.length].value;

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !(e[id] ?? true) }));
  const toggleProv = (id: string) => setExpandedProv((e)=> ({...e, [id]: !(e[id] ?? true)}));
  const openWizard = (accountId: string | null = null, providerId: string | null = null) => { onOpenWizard(accountId, providerId); setMobileOpen(false); };
  const validateName = (n: string) => n.trim().length >= 2 ? "" : "Min 2 characters";

  const handleCreateAccount = async () => {
    const err = validateName(accountName);
    if (err) { setAccountError(err); return; }
    setSaving(true);
    try { await onCreateAccount(accountName.trim()); setAccountName(""); setShowAccountDialog(false); toast({ title: "Account created", description: accountName.trim(), variant: "success" }); } catch (e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Failed to create account",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleRenameAccount = async () => {
    if (!editingAccount) return;
    const err = validateName(editAccountName);
    if (err) return toast({title:err,variant:"error"});
    setSaving(true);
    try { await onRenameAccount?.(editingAccount.id, editAccountName.trim()); setEditingAccount(null); toast({title:"Account renamed",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Rename failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleCreateProvider = async () => {
    if(!providerAccountId) return toast({title:"Select account",variant:"error"});
    const err = validateName(providerName);
    if(err) return toast({title:err,variant:"error"});
    setSaving(true);
    try{ await onCreateProvider?.(providerName.trim(), providerAccountId); setShowProviderDialog(false); setProviderName(""); toast({title:"Provider created",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Create failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleRenameProvider = async () => {
    if(!editingProvider) return;
    const err=validateName(editProviderName);
    if(err) return toast({title:err,variant:"error"});
    setSaving(true);
    try{ await onRenameProvider?.(editingProvider.id, editProviderName.trim()); setEditingProvider(null); toast({title:"Provider renamed",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Rename failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleEditPortfolio = async () => {
    if (!editingPortfolio) return;
    const err = validateName(editPName);
    if (err) return toast({title:err,variant:"error"});
    setSaving(true);
    try { await onRenamePortfolio?.(editingPortfolio.id, { name: editPName.trim(), type: editPType, accountId: editPAccount==="__none"?null:editPAccount, providerId: editPProvider==="__none"?null:editPProvider }); setEditingPortfolio(null); toast({title:"Portfolio updated",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Update failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleCreateDirectHolding = async () => {
    if(!directTarget && !editingDirectId) return;
    if(!directForm.symbol.trim() || !directForm.shares || !directForm.avgPrice) return toast({title:"Fill symbol, shares & price", variant:"error"});
    const isEdit = !!editingDirectId;
    const target = directTarget ?? { accountId: null, providerId: null };
    const payload: {
      symbol: string; name: string; shares: number; avgPrice: number;
      currentPrice: number; currency: string; exchange: string | undefined;
      purchaseDate: string; id?: string | null;
      accountId?: string | null; providerId?: string | null;
    } = {
      symbol: directForm.symbol.toUpperCase().trim(),
      name: directForm.name.trim() || directForm.symbol.toUpperCase().trim(),
      shares: Number(directForm.shares),
      avgPrice: Number(directForm.avgPrice),
      currentPrice: Number(directForm.currentPrice || directForm.avgPrice),
      currency: directForm.currency || "GBP",
      exchange: directForm.exchange || undefined,
      purchaseDate: new Date().toISOString().split("T")[0],
    };
    if (isEdit) payload.id = editingDirectId;
    else {
      payload.accountId = target.accountId ?? null;
      payload.providerId = target.providerId ?? null;
    }
    setDirectSaving(true);
    try {
      const res = await fetch("/api/holdings", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error(await res.text());
      await onRefresh?.();
      setShowDirectHolding(false); setDirectForm({ symbol:"", name:"", shares:"", avgPrice:"", exchange:"", currentPrice:"", currency:"GBP" }); setDirectSearchResults([]); setEditingDirectId(null);
      toast({title: isEdit ? "Stock updated" : "Stock added", description: directForm.symbol.toUpperCase(), variant:"success"});
    } catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Failed", description:msg, variant:"error"}); } finally{ setDirectSaving(false); }
  };
  const openDirectEdit = (h:Holding) => {
    setDirectTarget({ accountId: h.accountId ?? null, providerId: h.providerId ?? null });
    setDirectForm({ symbol: h.symbol, name: h.name, shares: String(h.shares), avgPrice: String(h.avgPrice), exchange: h.exchange ?? "", currentPrice: String(h.currentPrice ?? h.avgPrice), currency: h.currency ?? "GBP" });
    setEditingDirectId(h.id);
    setShowDirectHolding(true);
  };

  const allHoldings = useMemo(() => portfolios.flatMap((p) => p.holdings), [portfolios]);
  const lastRefresh = useMemo(() => { const ts = allHoldings.map((h) => h.lastRefreshedAt ?? 0).filter(Boolean) as number[]; return ts.length ? Math.max(...ts) : null; }, [allHoldings]);
  const loading = accountsReady===false || portfoliosReady===false;

  useEffect(() => {
    const v = directQuery.trim();
    if (v.length < 2) return;
    let stale = false;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(v)}`)
        .then(r => r.json())
        .then(j => {
          if (stale) return;
          setDirectSearchResults(Array.isArray(j) ? j : []);
          setDirectShowMenu(true);
        })
        .catch(() => {});
    }, 320);
    return () => { stale = true; clearTimeout(t); };
  }, [directQuery]);


  const inner = (
    <>
      <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Logo size={36} />
        <Button variant="ghost" size="icon-xs" className="md:hidden" onClick={()=>setMobileOpen(false)}><X className="w-4 h-4"/></Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <Button variant={activeId === null ? "secondary" : "ghost"} className="w-full justify-start gap-2.5" onClick={() => { onSelect(null); setMobileOpen(false); }}>
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </Button>

        <div className="mt-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500"/>
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search accounts, providers, portfolios…" className="pl-8 h-8 bg-white/[0.04] border-white/10 text-xs"/>
          {q && <button onClick={()=>setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5"/></button>}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-500">Accounts</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setShowAccountDialog(true)} aria-label="New account"><Plus className="w-3.5 h-3.5" /></Button>
          </div>

          {loading ? <div className="space-y-3">{[1,2].map(i=><Skeleton key={i} className="h-20 rounded-xl bg-white/5"/>)}</div>
          : accounts.length === 0 && unassigned.length === 0 ? <Card className="p-6 text-center border-dashed bg-white/[0.02]"><p className="text-sm text-zinc-500">No accounts yet</p><p className="text-xs text-zinc-600 mt-1">Create an account to group providers & portfolios</p><Button size="sm" className="mt-3" onClick={()=>setShowAccountDialog(true)}><Plus className="w-3.5 h-3.5"/>New account</Button></Card>
          : (
          <div className="space-y-3">
            {filteredAccounts.map((acc) => {
              const isOpen = expanded[acc.id] ?? true;
              const total = accountTotals(acc.id);
              const provs = filteredProviders(providersByAccount.get(acc.id) ?? []);
              const direct = filteredPortfolios(directByAccount.get(acc.id) ?? []);
              const accColor = accColorFor(acc);
              return (
                <div key={acc.id} className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: accColor + "40", background: accColor + "26" }}>
                  <div className="flex items-center gap-1 p-1.5">
                    <Button variant="ghost" size="icon-xs" onClick={() => toggle(acc.id)} className="shrink-0"><ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} /></Button>
                    <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer" onClick={()=>toggle(acc.id)}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accColor }} />
                      {isOpen ? <FolderOpen className="w-4 h-4 text-zinc-500 shrink-0" /> : <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />}
                      <span className="truncate text-sm font-medium text-zinc-200">{acc.name}</span>
                    </div>
                    <span className="text-xs tabular-nums text-zinc-500 pr-1 hidden sm:inline">£{total.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Account actions"><MoreVertical className="w-3.5 h-3.5"/></Button>} />
                      <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white min-w-40">
                        <DropdownMenuItem onClick={()=>{ setEditingAccount(acc); setEditAccountName(acc.name); }}><Pencil className="w-3.5 h-3.5"/>Rename account</DropdownMenuItem>
                        <DropdownMenuItem onClick={()=>{ setProviderAccountId(acc.id); setProviderName(""); setShowProviderDialog(true); }}><Briefcase className="w-3.5 h-3.5"/>New provider</DropdownMenuItem>
                        <DropdownMenuItem onClick={()=>{ setDirectTarget({accountId: acc.id}); setDirectForm({symbol:"",name:"",shares:"",avgPrice:"",exchange:"",currentPrice:"",currency:"GBP"}); setEditingDirectId(null); setDirectShowMenu(false); setShowDirectHolding(true); }}><TrendingUp className="w-3.5 h-3.5"/>Add stock directly</DropdownMenuItem>
                        <DropdownMenuItem onClick={()=>openWizard(acc.id, null)}><Layers className="w-3.5 h-3.5"/>New portfolio</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10"/>
                        <DropdownMenuItem variant="destructive" onClick={()=> onDeleteAccount?.(acc)}><Trash2 className="w-3.5 h-3.5"/>Delete account</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3">
                      {provs.length===0 && direct.length===0 && <div className="p-4 rounded-xl border border-dashed border-white/10 bg-black/20 text-center"><p className="text-sm text-zinc-400">No providers yet</p><p className="text-xs text-zinc-600 mt-1">Add a provider like Vanguard or Trading 212</p><div className="flex gap-2 mt-3"><Button variant="outline" size="sm" className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-xs h-8" onClick={()=>{setProviderAccountId(acc.id); setProviderName(""); setShowProviderDialog(true);}}><Plus className="w-3.5 h-3.5"/> Provider</Button><Button variant="outline" size="sm" className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-xs h-8" onClick={()=>openWizard(acc.id, null)}><Plus className="w-3.5 h-3.5"/> Portfolio</Button></div></div>}
                      {provs.map((pr, pi)=>{
                        const ps = filteredPortfolios(portfoliosByProvider.get(pr.id) ?? []);
                        const isProvOpen = expandedProv[pr.id] ?? true;
                        const provTotal = providerTotals(pr.id);
                        const provColor = pr.color || portfolioTint(accColorFor(acc), pi);
                        return (
                          <div key={pr.id} className="rounded-lg border overflow-hidden" style={{ borderColor: provColor + "38", background: provColor + "20" }}>
                            <div className="flex items-center gap-1 p-1">
                              <Button variant="ghost" size="icon-xs" onClick={()=>toggleProv(pr.id)} className="shrink-0"><ChevronDown className={`w-3 h-3 transition-transform ${isProvOpen ? "" : "-rotate-90"}`} /></Button>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: provColor }} />
                              <Briefcase className="w-3.5 h-3.5 text-zinc-600 shrink-0"/>
                              <span className="flex-1 truncate text-xs font-medium text-zinc-300">{pr.name}</span>
                              <span className="text-[11px] tabular-nums text-zinc-500">£{provTotal.toLocaleString("en-GB",{maximumFractionDigits:0})}</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs"><MoreVertical className="w-3 h-3"/></Button>} />
                                <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white min-w-[220px]">
                                  <DropdownMenuItem onClick={()=>{setEditingProvider(pr); setEditProviderName(pr.name);}}><Pencil className="w-3.5 h-3.5"/>Rename provider</DropdownMenuItem>
                                  <DropdownMenuItem onClick={()=>{ setDirectTarget({providerId: pr.id, accountId: pr.accountId}); setDirectForm({symbol:"",name:"",shares:"",avgPrice:"",exchange:"",currentPrice:"",currency:"GBP"}); setEditingDirectId(null); setDirectShowMenu(false); setShowDirectHolding(true); }}><TrendingUp className="w-3.5 h-3.5"/>Add stock directly</DropdownMenuItem>
                                  <DropdownMenuItem className="whitespace-nowrap" onClick={()=>openWizard(acc.id, pr.id)}><Plus className="w-3.5 h-3.5"/>New portfolio here</DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-white/10"/>
                                  <DropdownMenuItem variant="destructive" onClick={()=>onDeleteProvider?.(pr)}><Trash2 className="w-3.5 h-3.5"/>Delete provider</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {isProvOpen && (
                              <div className="px-1 pb-1 space-y-0.5">
                                {ps.length===0 && <p className="text-[11px] text-zinc-600 px-2 py-1">No portfolios</p>}
                                {ps.map((p, pIdx)=>{
                                  const val=p.holdings.reduce((s,h:Holding)=>s+holdingValueGBP(h),0);
                                  const active=activeId===p.id;
                                  const baseColor = p.color || portfolioTint(provColor, pIdx);
                                  const selectedBg = baseColor;
                                  const activeText = isLightColor(selectedBg) ? "#0a0a0a" : "#fff";
                                  const activeMuted = isLightColor(selectedBg) ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
                                  return (
                                    <div key={p.id} className={`group flex items-center gap-1 p-1 rounded-md border ${active?"border-2 shadow-md":"bg-white/[0.04] text-zinc-300 border-white/[0.04] hover:border-white/10"}`} style={active ? { background: selectedBg, borderColor: selectedBg, color: activeText } : { borderLeftColor: baseColor, borderLeftWidth: 2 }}>
                                      <Button variant="ghost" size="sm" className={`flex-1 justify-start gap-1.5 h-6 ${active?"hover:bg-black/10":"hover:bg-white/5"}`} style={active ? { color: activeText } : {}} onClick={()=>{onSelect(p.id); setMobileOpen(false);}}>
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? activeText : baseColor, opacity: active ? 0.9 : 1 }} />
                                        <Folder className="w-3 h-3 shrink-0" style={{ color: active ? activeMuted : undefined }} />
                                        <span className="truncate text-[11px] font-medium" style={active ? { color: activeText } : {}}>{p.name}</span>
                                      </Button>
                                      <span className="text-[11px] tabular-nums pr-1" style={{ color: active ? activeMuted : undefined }}>£{val.toLocaleString("en-GB",{maximumFractionDigits:0})}</span>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="h-5 w-5"><MoreVertical className="w-3 h-3"/></Button>} />
                                        <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white">
                                          <DropdownMenuItem onClick={()=>{ setEditingPortfolio(p); setEditPName(p.name); setEditPType(p.type); setEditPAccount(p.accountId??"__none"); setEditPProvider(p.providerId??"__none"); }}><Pencil className="w-3 h-3"/>Edit</DropdownMenuItem>
                                          <DropdownMenuItem variant="destructive" onClick={()=> onDeletePortfolio?.(p)}><Trash2 className="w-3 h-3"/>Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  );
                                })}
                                {(holdings ?? []).filter((h:Holding)=> h.providerId===pr.id && !h.portfolioId).length>0 && (
                                  <div className="mt-2 pt-2 border-t border-white/5">
                                    <div className="text-[10px] tracking-widest uppercase text-zinc-600 px-1 mb-1">Direct stocks</div>
                                    {(holdings ?? []).filter((h:Holding)=> h.providerId===pr.id && !h.portfolioId).map((h:Holding)=>(
                                      <div key={h.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/5 text-xs ${onSelectHolding?"cursor-pointer hover:bg-white/[0.07]":""}`} onClick={()=> onSelectHolding?.(h)}>
                                        <span className="w-6 h-6 rounded grid place-items-center bg-white/10 text-[10px] font-bold">{String(h.symbol).slice(0,3)}</span>
                                        <span className="flex-1 truncate text-zinc-200">{h.symbol}</span>
                                        <span className="text-zinc-500">£{holdingValueGBP(h).toFixed(0)}</span>
                                        <Button variant="ghost" size="icon-xs" className="h-6 w-6 relative z-10 text-zinc-500 hover:text-white" onClick={(e)=>{ e.stopPropagation(); openDirectEdit(h); }}><Pencil className="w-3 h-3"/></Button>
                                        <Button variant="ghost" size="icon-xs" className="h-6 w-6 relative z-10 text-zinc-500 hover:text-red-400" onClick={(e)=>{ e.stopPropagation(); fetch(`/api/holdings?id=${h.id}`,{method:"DELETE"}).then(()=>{ onRefresh?.(); toast({title:"Stock removed", variant:"success"}); }); }}><Trash2 className="w-3 h-3"/></Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {direct.length>0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] tracking-widest uppercase text-zinc-600 px-1">Direct portfolios</div>
                          {direct.map((p, di)=>{
                            const val=p.holdings.reduce((s,h:Holding)=>s+holdingValueGBP(h),0);
                            const active=activeId===p.id;
                            const baseColor = p.color || portfolioTint(accColorFor(acc), di);
                            const selectedBg = baseColor;
                            const activeText = isLightColor(selectedBg) ? "#0a0a0a" : "#fff";
                            const activeMuted = isLightColor(selectedBg) ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
                            return (
                              <div key={p.id} className={`group flex items-center gap-1 p-1 rounded-lg border ${active?"border-2 shadow-md":"bg-white/[0.04] text-zinc-300 border-white/[0.06] hover:border-white/10"}`} style={active ? { background: selectedBg, borderColor: selectedBg, color: activeText } : { borderLeftColor: baseColor, borderLeftWidth: 2 }}>
                                <Button variant="ghost" size="sm" className={`flex-1 justify-start gap-2 h-7 ${active?"hover:bg-black/10":"hover:bg-white/5"}`} style={active ? { color: activeText } : {}} onClick={()=>{onSelect(p.id); setMobileOpen(false);}}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? activeText : baseColor, opacity: active ? 0.9 : 1 }} />
                                  <Folder className={`w-3.5 h-3.5 shrink-0`} style={{ color: active ? activeMuted : undefined }} />
                                  <span className="truncate text-xs font-medium" style={active ? { color: activeText } : {}}>{p.name}</span>
                                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium" style={active ? { background: isLightColor(selectedBg) ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.18)", color: activeMuted } : {}}>{p.type}</span>
                                </Button>
                                <span className="text-xs tabular-nums pr-1 hidden md:inline" style={{ color: active ? activeMuted : undefined }}>£{val.toLocaleString("en-GB",{maximumFractionDigits:0})}</span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs"><MoreVertical className="w-3 h-3"/></Button>} />
                                  <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white">
                                    <DropdownMenuItem onClick={()=>{ setEditingPortfolio(p); setEditPName(p.name); setEditPType(p.type); setEditPAccount(p.accountId??"__none"); setEditPProvider(p.providerId??"__none"); }}><Pencil className="w-3 h-3"/>Edit</DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onClick={()=> onDeletePortfolio?.(p)}><Trash2 className="w-3 h-3"/>Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(holdings ?? []).filter((h:Holding)=> h.accountId===acc.id && !h.providerId && !h.portfolioId).length>0 && (
                        <div className="space-y-1 mt-2 pt-2 border-t border-white/5">
                          <div className="text-[10px] tracking-widest uppercase text-zinc-600 px-1">Direct stocks — {acc.name}</div>
                          {(holdings ?? []).filter((h:Holding)=> h.accountId===acc.id && !h.providerId && !h.portfolioId).map((h:Holding)=>(
                            <div key={h.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/5 text-xs ${onSelectHolding?"cursor-pointer hover:bg-white/[0.07]":""}`} onClick={()=> onSelectHolding?.(h)}>
                              <span className="w-6 h-6 rounded grid place-items-center bg-white/10 text-[10px] font-bold">{String(h.symbol).slice(0,3)}</span>
                              <span className="flex-1 truncate text-zinc-200">{h.symbol}</span>
                              <span className="text-zinc-500">£{holdingValueGBP(h).toFixed(0)}</span>
                              <Button variant="ghost" size="icon-xs" className="h-6 w-6 relative z-10 text-zinc-500 hover:text-red-400" onClick={(e)=>{ e.stopPropagation(); fetch(`/api/holdings?id=${h.id}`,{method:"DELETE"}).then(()=>{ onRefresh?.(); toast({title:"Stock removed", variant:"success"}); }); }}><Trash2 className="w-3 h-3"/></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {unassigned.length > 0 && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-600">Unassigned</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => openWizard(null)} aria-label="New portfolio"><Plus className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="px-1.5 pb-1.5 space-y-1">
                    {(filteredPortfolios(unassigned)).map((p, ui) => {
                    const val = p.holdings.reduce((s, h:Holding) => s + holdingValueGBP(h), 0);
                    const active = activeId === p.id;
                    const baseColor = p.color || PALETTE[ui % PALETTE.length].value;
                    const selectedBg = baseColor;
                    const activeText = isLightColor(selectedBg) ? "#0a0a0a" : "#fff";
                    const activeMuted = isLightColor(selectedBg) ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
                    return (
                      <div key={p.id} className={`group flex items-center gap-1 p-1 rounded-lg border transition-colors ${active ? "border-2 shadow-md" : "bg-white/[0.04] text-zinc-300 border-white/[0.06] hover:border-white/10"}`} style={active ? { background: selectedBg, borderColor: selectedBg, color: activeText } : { borderLeftColor: baseColor, borderLeftWidth: 2 }}>
                        <Button variant="ghost" size="sm" className={`flex-1 justify-start gap-2 h-7 ${active ? "hover:bg-black/10" : "hover:bg-white/5"}`} style={active ? { color: activeText } : {}} onClick={() => { onSelect(p.id); setMobileOpen(false); }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? activeText : baseColor }} />
                          <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: active ? activeMuted : undefined }} />
                          <span className="truncate text-xs font-medium" style={active ? { color: activeText } : {}}>{p.name}</span>
                        </Button>
                        <span className="text-xs tabular-nums pr-1" style={{ color: active ? activeMuted : undefined }}>£{val.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs"><MoreVertical className="w-3 h-3"/></Button>} />
                          <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white">
                            <DropdownMenuItem onClick={()=>{ setEditingPortfolio(p); setEditPName(p.name); setEditPType(p.type); setEditPAccount(p.accountId ?? "__none"); setEditPProvider("__none"); }}><Pencil className="w-3 h-3"/>Edit</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10"/>
                            <DropdownMenuItem variant="destructive" onClick={()=> onDeletePortfolio?.(p)}><Trash2 className="w-3 h-3"/>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}
          <div className="mt-4">
            <Button size="default" className={`w-full h-10 font-medium ${portfolios.length>0 ? "bg-white/[0.06] border border-white/10 text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-400" : "bg-white text-black hover:bg-zinc-100 font-semibold shadow-lg"}`} onClick={() => openWizard(null)}><Plus className="w-4 h-4"/> {portfolios.length>0 ? "New portfolio" : "New portfolio"}</Button>
            <p className="text-xs text-zinc-600 text-center mt-2">Account → Provider → Portfolio</p>
          </div>
        </div>

      </nav>
      <div className="mx-3 mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Clock className="w-3.5 h-3.5 text-zinc-500" /> Prices update daily</div>
        <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">Automated at 06:00 UTC via cron. No manual refresh needed.</p>
        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">Last refresh</span>
          <span className="text-[11px] font-medium text-zinc-400">{lastRefresh ? fmtRelative(lastRefresh) : "—"}</span>
        </div>
      </div>
      <div className="p-3 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <a href="/settings" className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full justify-start gap-2 text-zinc-400 hover:text-white" })}><Settings className="w-4 h-4"/> Settings</a>
        <div className="flex gap-2">
          <a href={isDemo ? "/api/demo?clear=1" : "/logout"} className={buttonVariants({ variant: "ghost", size: "sm", className: "flex-1 justify-start text-zinc-500 hover:text-white" })}><LogOut className="w-4 h-4" /> {isDemo ? "Exit demo" : "Sign out"}</a>
          {isDemo && <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-amber-400 text-black font-semibold self-center">DEMO</span>}
        </div>
      </div>

      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Account name</Label><Input value={accountName} onChange={(e) => { setAccountName(e.target.value); setAccountError(""); }} placeholder="e.g. Household, Personal" autoFocus onKeyDown={e=>e.key==="Enter"&&handleCreateAccount()} aria-invalid={!!accountError}/>{accountError && <p className="text-xs text-red-400">{accountError}</p>}</div>
            <p className="text-xs text-zinc-500">Top level — holds providers. e.g. Household, Joint.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAccountDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateAccount} disabled={!accountName.trim() || saving}>{saving?"Creating…":"Create account"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>New provider</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Provider name</Label><Input value={providerName} onChange={e=>setProviderName(e.target.value)} placeholder="e.g. Vanguard, Hargreaves Lansdown, Trading 212" autoFocus /></div>
            <div className="space-y-2"><Label>Account</Label>
              <Select value={providerAccountId ?? "__none"} onValueChange={v=>setProviderAccountId(v==="__none"?null:v)}>
                <SelectTrigger><span className="flex-1 text-left truncate">{providerAccountId ? accounts.find(a=>a.id===providerAccountId)?.name ?? "—" : "Select account"}</span></SelectTrigger>
                <SelectContent>
                  {accounts.map(a=> <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setShowProviderDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateProvider} disabled={!providerName.trim() || !providerAccountId || saving}>{saving?"Creating…":"Create provider"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAccount} onOpenChange={o=>!o&&setEditingAccount(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>Rename account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editAccountName} onChange={e=>setEditAccountName(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&handleRenameAccount()} placeholder="Account name"/></div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingAccount(null)}>Cancel</Button>
              <Button onClick={handleRenameAccount} disabled={saving || !editAccountName.trim()}>{saving?"Saving…":"Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingProvider} onOpenChange={o=>!o&&setEditingProvider(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>Rename provider</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editProviderName} onChange={e=>setEditProviderName(e.target.value)} autoFocus /></div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingProvider(null)}>Cancel</Button>
              <Button onClick={handleRenameProvider} disabled={saving || !editProviderName.trim()}>{saving?"Saving…":"Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDirectHolding} onOpenChange={setShowDirectHolding}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Add stock directly — {directTarget?.providerId ? providers.find(p=>p.id===directTarget.providerId)?.name : accounts.find(a=>a.id===directTarget?.accountId)?.name ?? "—"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Symbol *</Label>
              <div className="relative">
                <Input value={directForm.symbol} onChange={e=>{ const v=e.target.value.toUpperCase(); setDirectForm({...directForm, symbol:v}); setDirectQuery(v); if(v.trim().length<2){ setDirectSearchResults([]); setDirectShowMenu(false);} }} placeholder="AAPL or Apple" autoComplete="off" />
                {directShowMenu && directSearchResults.length>0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-xl max-h-48 overflow-auto">
                    {directSearchResults.map((r:SearchResult)=>(
                      <button key={r.symbol+r.exchange} type="button" onMouseDown={(e)=>{e.preventDefault(); setDirectForm({...directForm, symbol:r.symbol, name:r.name, exchange:r.exchange, currentPrice: r.price ? String(r.price) : directForm.currentPrice, currency: r.currency ?? directForm.currency}); setDirectShowMenu(false);}} className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-2">
                        <div><div className="text-sm text-white">{r.symbol} <span className="text-xs text-zinc-500">{r.exchange}</span>{r.price!=null && <span className="text-xs text-emerald-400 ml-1">{r.currency==="GBX"||r.currency==="GBp" ? `${Math.round(r.price).toLocaleString("en-GB")}p` : `£${Number(r.price).toFixed(2)}`}</span>}</div><div className="text-xs text-zinc-500 truncate">{r.name}</div></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2"><Label>Name</Label><Input value={directForm.name} onChange={e=>setDirectForm({...directForm, name:e.target.value})} placeholder="Apple Inc" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Shares *</Label><Input type="number" value={directForm.shares} onChange={e=>setDirectForm({...directForm, shares:e.target.value})} placeholder="10" /></div>
              <div className="space-y-2"><Label>Avg price *</Label><Input type="number" value={directForm.avgPrice} onChange={e=>setDirectForm({...directForm, avgPrice:e.target.value})} placeholder="150" /></div>
            </div>
            <div className="space-y-2">
              <Label>Current price <span className="text-zinc-500 font-normal">(live)</span></Label>
              <div className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 flex items-center text-sm text-zinc-300">
                {directForm.currentPrice ? fmtPrice(Number(directForm.currentPrice), directForm.currency) : "— auto-filled from Yahoo"}
                <span className="ml-auto text-xs text-zinc-600">read-only</span>
              </div>
              <p className="text-xs text-zinc-600">Helps calculate gain; avg cost is what you paid</p>
            </div>
            <div className="space-y-2"><Label>Exchange</Label>
              <Select value={directForm.exchange || "__auto"} onValueChange={v=> setDirectForm({...directForm, exchange: (v as string)==="__auto" ? "" : (v as string)})}>
                <SelectTrigger><span className="flex-1 text-left truncate text-sm">{directForm.exchange || "Auto"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Auto</SelectItem>
                  <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                  <SelectItem value="NYSE">NYSE</SelectItem>
                  <SelectItem value="AMEX">AMEX</SelectItem>
                  <SelectItem value="LSE">LSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=> setShowDirectHolding(false)}>Cancel</Button>
              <Button onClick={handleCreateDirectHolding} disabled={directSaving} className="bg-white text-black hover:bg-zinc-100">{directSaving?"Adding...":"Add stock"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPortfolio} onOpenChange={o=>!o&&setEditingPortfolio(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Edit portfolio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editPName} onChange={e=>setEditPName(e.target.value)} autoFocus/></div>
            <div className="space-y-2"><Label>Type</Label>
              <Select value={editPType} onValueChange={v=>setEditPType(v as "live"|"manual")}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPType==="live"?"Live — auto prices":"Manual — cash/custom"}</span></SelectTrigger>
                <SelectContent><SelectItem value="live">Live — auto prices</SelectItem><SelectItem value="manual">Manual — pension/cash</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Account</Label>
              <Select value={editPAccount} onValueChange={(v)=>{setEditPAccount(v as string); setEditPProvider("__none");}}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPAccount === "__none" ? "Unassigned" : accounts.find((a)=>a.id===editPAccount)?.name ?? "—"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {accounts.map(a=> <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Provider</Label>
              <Select value={editPProvider} onValueChange={v=>setEditPProvider(v as string)} disabled={editPAccount==="__none"}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPProvider==="__none" ? "No provider" : providers.find(p=>p.id===editPProvider)?.name ?? "—"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No provider</SelectItem>
                  {providers.filter(pr=> pr.accountId===editPAccount).map(pr=> <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingPortfolio(null)}>Cancel</Button>
              <Button onClick={handleEditPortfolio} disabled={saving || !editPName.trim()}>{saving?"Saving…":"Save changes"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <>
      <Button variant="ghost" size="icon" className="md:hidden fixed top-3 left-3 z-40 bg-black/70 backdrop-blur border border-white/10" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu className="w-4 h-4"/></Button>
      <aside className="hidden md:flex w-[360px] shrink-0 flex-col h-screen sticky top-0 border-r bg-black/40 backdrop-blur-xl" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        {inner}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={()=>setMobileOpen(false)}/>
          <div className="w-[85vw] max-w-[380px] bg-black border-r border-white/10 flex flex-col h-full overflow-hidden">{inner}</div>
        </div>
      )}
    </>
  );
}

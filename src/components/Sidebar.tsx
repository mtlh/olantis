"use client";
import { Portfolio, Account } from "@/lib/store";
import { LayoutDashboard, Plus, Folder, FolderOpen, LogOut, Building2, ChevronDown, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { CreatePortfolioWizard } from "@/components/CreatePortfolioWizard";

function fmtRelative(ts?: number | null) {
  if (!ts) return "never";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function Sidebar({ accounts, portfolios, activeId, onSelect, onCreate, onCreateAccount, isDemo }: {
  accounts: Account[]; portfolios: Portfolio[]; activeId: string | null; onSelect: (id: string | null) => void;
  onCreate: (name: string, type: "live" | "manual", accountId?: string | null) => void;
  onCreateAccount: (name: string) => void;
  isDemo?: boolean;
}) {
  const [showWizard, setShowWizard] = useState(false);
  const [wizardAccountId, setWizardAccountId] = useState<string | null>(null);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = new Map<string | null, Portfolio[]>();
  for (const p of portfolios) {
    const key = (p.accountId as string | null) ?? null;
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }
  const unassigned = grouped.get(null) ?? [];

  const accountTotals = (aid: string) => {
    const ps = grouped.get(aid) ?? [];
    return ps.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0), 0);
  };

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !(e[id] ?? true) }));

  const openWizard = (accountId: string | null = null) => {
    setWizardAccountId(accountId);
    setShowWizard(true);
  };

  const handleCreateAccount = async () => {
    if (!accountName.trim()) return;
    await onCreateAccount(accountName.trim());
    setAccountName("");
    setShowAccountDialog(false);
  };

  const allHoldings = useMemo(() => portfolios.flatMap((p) => p.holdings), [portfolios]);
  const lastRefresh = useMemo(() => {
    const ts = allHoldings.map((h) => h.lastRefreshedAt ?? 0).filter(Boolean) as number[];
    return ts.length ? Math.max(...ts) : null;
  }, [allHoldings]);

  return (
    <aside className="w-[280px] shrink-0 flex flex-col h-screen sticky top-0 border-r bg-black/40 backdrop-blur-xl" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Logo size={36} />
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <Button variant={activeId === null ? "secondary" : "ghost"} className="w-full justify-start gap-2.5" onClick={() => onSelect(null)}>
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </Button>

        <div className="mt-6">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-500">Accounts</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setShowAccountDialog(true)} aria-label="New account"><Plus className="w-3.5 h-3.5" /></Button>
          </div>

          {accounts.length === 0 && unassigned.length === 0 && <Card className="p-6 text-center border-dashed bg-white/[0.02]"><p className="text-sm text-zinc-500">No accounts yet</p><p className="text-xs text-zinc-600 mt-1">Create an account to group portfolios</p></Card>}

          <div className="space-y-3">
            {accounts.map((acc) => {
              const ps = grouped.get(acc.id) ?? [];
              const isOpen = expanded[acc.id] ?? true;
              const total = accountTotals(acc.id);
              return (
                <div key={acc.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
                  <div className="flex items-center gap-1 p-1.5">
                    <Button variant="ghost" size="icon-xs" onClick={() => toggle(acc.id)} className="shrink-0"><ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} /></Button>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {isOpen ? <FolderOpen className="w-4 h-4 text-zinc-500 shrink-0" /> : <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />}
                      <span className="truncate text-sm font-medium text-zinc-200">{acc.name}</span>
                    </div>
                    <span className="text-xs tabular-nums text-zinc-500 pr-1">£{total.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                    <Button variant="ghost" size="icon-xs" onClick={() => openWizard(acc.id)} aria-label="New portfolio in account"><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                  {isOpen && (
                    <div className="px-1.5 pb-1.5 space-y-1">
                      {ps.length === 0 && <p className="text-xs text-zinc-600 px-2 py-1.5">No portfolios</p>}
                      {ps.map((p) => {
                        const val = p.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
                        const active = activeId === p.id;
                        return (
                          <div key={p.id} className={`group flex items-center gap-1 p-1 rounded-lg border transition-colors ${active ? "bg-white text-black border-white" : "bg-white/[0.04] text-zinc-300 border-white/[0.06] hover:border-white/10"}`}>
                            <Button variant="ghost" size="sm" className={`flex-1 justify-start gap-2 h-7 ${active ? "hover:bg-black/5 text-black" : "hover:bg-white/5"}`} onClick={() => onSelect(p.id)}>
                              <Folder className={`w-3.5 h-3.5 shrink-0 ${active ? "text-black/60" : "text-zinc-500"}`} />
                              <span className="truncate text-xs font-medium">{p.name}</span>
                            </Button>
                            <span className={`text-xs tabular-nums pr-1 ${active ? "text-black/60" : "text-zinc-500"}`}>£{val.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                          </div>
                        );
                      })}
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
                    {unassigned.map((p) => {
                    const val = p.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
                    const active = activeId === p.id;
                    return (
                      <div key={p.id} className={`group flex items-center gap-1 p-1 rounded-lg border transition-colors ${active ? "bg-white text-black border-white" : "bg-white/[0.04] text-zinc-300 border-white/[0.06] hover:border-white/10"}`}>
                        <Button variant="ghost" size="sm" className={`flex-1 justify-start gap-2 h-7 ${active ? "hover:bg-black/5 text-black" : "hover:bg-white/5"}`} onClick={() => onSelect(p.id)}>
                          <Folder className={`w-3.5 h-3.5 shrink-0 ${active ? "text-black/60" : "text-zinc-500"}`} />
                          <span className="truncate text-xs font-medium">{p.name}</span>
                        </Button>
                        <span className={`text-xs tabular-nums pr-1 ${active ? "text-black/60" : "text-zinc-500"}`}>£{val.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {accounts.length > 0 && portfolios.length === 0 && <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-500" onClick={() => openWizard(accounts[0].id)}><Plus className="w-4 h-4" /> New portfolio</Button>}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 bg-white/5 border-white/10 text-xs" onClick={() => openWizard(null)}>New portfolio</Button>
          </div>
        </div>

        <div className="mt-6 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs text-zinc-400"><Clock className="w-3.5 h-3.5" /> Prices update daily</div>
          <p className="text-xs text-zinc-600 mt-1">Automated at 06:00 UTC via cron. No manual refresh needed.</p>
          <p className="text-xs text-zinc-500 mt-2">Last refresh: {lastRefresh ? fmtRelative(lastRefresh) : "—"}</p>
        </div>
      </nav>
      <div className="p-3 border-t flex gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <a href={isDemo ? "/api/demo?clear=1" : "/logout"} className={buttonVariants({ variant: "ghost", size: "sm", className: "flex-1 justify-start text-zinc-500 hover:text-white" })}><LogOut className="w-4 h-4" /> {isDemo ? "Exit demo" : "Sign out"}</a>
        {isDemo && <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-amber-400 text-black font-semibold self-center">DEMO</span>}
      </div>

      <CreatePortfolioWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        accounts={accounts}
        defaultAccountId={wizardAccountId}
        onCreate={async (name, type, accountId, extra) => {
          await onCreate(name, type, accountId);
          if (extra?.symbol) {
            try {
              const res = await fetch("/api/portfolios");
              const list = await res.json();
              const created = list.find((p: any) => p.name === name);
              if (created?.id) {
                await fetch("/api/holdings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    portfolioId: created.id,
                    symbol: extra.symbol,
                    name: extra.symbol,
                    shares: Number(extra.shares || 1),
                    avgPrice: 100,
                    currentPrice: 100,
                    currency: "GBP",
                    purchaseDate: new Date().toISOString().split("T")[0],
                  }),
                });
              }
            } catch {}
          }
        }}
      />

      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Account name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Trading 212, HL, Barclays" autoFocus /></div>
            <p className="text-xs text-zinc-500">Portfolios live inside accounts. Create an account, then add portfolios to it.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAccountDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateAccount} disabled={!accountName.trim()}>Create account</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

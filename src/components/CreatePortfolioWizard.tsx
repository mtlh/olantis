"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, Wallet, TrendingUp, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Account } from "@/lib/store";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; accounts: Account[]; defaultAccountId?: string | null; onCreate: (name: string, type: "live" | "manual", accountId: string | null, extra?: any) => void; inline?: boolean };

export function CreatePortfolioWizard({ open, onOpenChange, accounts, defaultAccountId, onCreate, inline }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<"live" | "manual">("live");
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId ?? null);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");

  useEffect(() => { if (open) setAccountId(defaultAccountId ?? null); }, [open, defaultAccountId]);

  if (!open) return null;
  const canNext = step === 1 ? name.trim().length >= 2 : true;
  const handleCreate = () => {
    onCreate(name.trim(), type, accountId, { symbol: symbol.toUpperCase().trim(), shares });
    setName(""); setSymbol(""); setShares(""); setStep(1);
    onOpenChange(false);
  };
  const close = () => { setStep(1); onOpenChange(false); };

  const shell = inline
    ? "flex flex-col rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden w-full"
    : "fixed inset-0 z-50 flex flex-col bg-black";
  return (
    <div className={shell}>
      <div className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white text-black grid place-items-center font-bold text-sm">O</div>
          <span className="font-semibold text-white">New portfolio</span>
          <Badge variant="outline" className="border-white/10 text-zinc-400">Step {step} of 3</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
      </div>

      <div className="h-1 bg-white/5">
        <div className="h-full bg-white transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      <div className="flex-1 overflow-auto p-6 md:p-10 flex justify-center">
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className={`px-2.5 py-1 rounded-full border ${step >= 1 ? "bg-white text-black border-white" : "border-white/10"}`}>1 Details</span>
            <span className="flex-1 h-px bg-white/10" />
            <span className={`px-2.5 py-1 rounded-full border ${step >= 2 ? "bg-white text-black border-white" : "border-white/10"}`}>2 Holdings</span>
            <span className="flex-1 h-px bg-white/10" />
            <span className={`px-2.5 py-1 rounded-full border ${step >= 3 ? "bg-white text-black border-white" : "border-white/10"}`}>3 Review</span>
          </div>

          {step === 1 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Wallet className="w-5 h-5" /> Portfolio details</CardTitle>
                <CardDescription>Name, account and type — you can change these later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="pname">Portfolio name</Label>
                  <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ISA, SIPP, GIA" autoFocus className="h-11 text-base" />
                  <p className="text-xs text-zinc-500">2–32 characters. Shows inside its account folder.</p>
                </div>
                <div className="space-y-2">
                  <Label>Account (parent folder)</Label>
                  <Select value={accountId ?? "__none"} onValueChange={(v) => setAccountId(v === "__none" ? null : v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No account (unassigned)</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">Accounts group portfolios in the sidebar.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "live", title: "Live", desc: "Auto-updated prices", icon: TrendingUp },
                    { id: "manual", title: "Manual", desc: "Pensions, cash, custom", icon: Layers },
                  ].map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setType(o.id as any)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${type === o.id ? "bg-white text-black border-white" : "bg-white/[0.04] border-white/10 hover:bg-white/[0.06] hover:border-white/15 text-white"}`}
                    >
                      <o.icon className={`w-5 h-5 mb-2 ${type === o.id ? "text-black" : "text-zinc-400"}`} />
                      <div className="font-medium text-sm">{o.title}</div>
                      <div className={`text-xs ${type === o.id ? "text-black/60" : "text-zinc-500"}`}>{o.desc}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-white">Add first holding <span className="text-zinc-500 font-normal text-sm">(optional)</span></CardTitle>
                <CardDescription>Skip now — you can add holdings later from the dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Symbol</Label><Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL, VWRP" /></div>
                  <div className="space-y-2"><Label>Shares</Label><Input type="number" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" /></div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-400">Tip: Live portfolios fetch current prices on refresh.</div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Check className="w-5 h-5 text-emerald-400" /> Review</CardTitle>
                <CardDescription>Confirm and create. You can edit everything after.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Name</div><div className="font-medium text-white">{name || "—"}</div></div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Type</div><div className="font-medium text-white capitalize">{type}</div></div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 col-span-2"><div className="text-xs text-zinc-500">Account</div><div className="font-medium text-white">{accountId ? accounts.find((a) => a.id === accountId)?.name ?? accountId : "Unassigned"}</div></div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 col-span-2"><div className="text-xs text-zinc-500">First holding</div><div className="font-medium text-white">{symbol ? `${symbol} — ${shares || 0} shares` : "None (skip)"}</div></div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="p-6 md:px-10 border-t border-white/10 flex items-center justify-between bg-black">
        <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : close())} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> {step === 1 ? "Cancel" : "Back"}
        </Button>
        <div className="flex gap-2">
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-2 min-w-28">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!canNext} className="gap-2 min-w-28">
              <Check className="w-4 h-4" /> Create portfolio
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

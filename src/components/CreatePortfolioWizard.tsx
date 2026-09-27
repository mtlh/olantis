"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, Wallet, TrendingUp, Layers, Briefcase } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Account, Provider } from "@/lib/store";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
  providers?: Provider[];
  defaultAccountId?: string | null;
  defaultProviderId?: string | null;
  onCreate: (name: string, type: "live" | "manual", accountId: string | null, providerId: string | null, extra?: { symbol?: string; shares?: string }) => void | Promise<void>;
  inline?: boolean;
};

export function CreatePortfolioWizard({ open, onOpenChange, accounts, providers = [], defaultAccountId, defaultProviderId, onCreate, inline }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<"live" | "manual">("live");
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId ?? null);
  const [providerId, setProviderId] = useState<string | null>(defaultProviderId ?? null);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const prevDefaultsRef = useRef<{ accountId: string | null | undefined; providerId: string | null | undefined }>({ accountId: undefined, providerId: undefined });
  useEffect(() => {
    if (open && (prevDefaultsRef.current.accountId !== defaultAccountId || prevDefaultsRef.current.providerId !== defaultProviderId)) {
      setAccountId(defaultAccountId ?? null);
      setProviderId(defaultProviderId ?? null);
    }
    prevDefaultsRef.current = { accountId: defaultAccountId, providerId: defaultProviderId };
  }, [open, defaultAccountId, defaultProviderId]);

  const filteredProviders = useMemo(() => (accountId ? providers.filter((p) => p.accountId === accountId) : []), [providers, accountId]);
  const prevFilteredRef = useRef<Provider[]>([]);
  useEffect(() => {
    if (providerId && accountId && prevFilteredRef.current.find((p) => p.id === providerId) && !filteredProviders.find((p) => p.id === providerId)) setProviderId(null);
    prevFilteredRef.current = filteredProviders;
  }, [accountId, filteredProviders, providerId]);

  if (!open) return null;
  const canNext = step === 1 ? name.trim().length >= 2 : true;

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      await onCreate(name.trim(), type, accountId, providerId, { symbol: symbol.toUpperCase().trim(), shares });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
      return;
    }
    setCreating(false);
    setName("");
    setSymbol("");
    setShares("");
    setStep(1);
    onOpenChange(false);
  };

  const close = () => {
    setStep(1);
    setError("");
    onOpenChange(false);
  };

  const detailsCard = (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2"><Wallet className="w-5 h-5" /> Portfolio details</CardTitle>
        <CardDescription>Account → Provider → Portfolio — you can change these later.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="pname">Portfolio name</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Growth, Income, ISA Wrapper" autoFocus className="h-11 text-base" />
          <p className="text-xs text-zinc-500">2–32 characters. Lives inside its provider.</p>
        </div>
        <div className="space-y-2">
          <Label>Account (top level)</Label>
          <Select value={accountId ?? "__none"} onValueChange={(v) => setAccountId(v === "__none" ? null : v)}>
            <SelectTrigger className="h-11">
              <span className="flex-1 text-left truncate">{accountId ? accounts.find((a) => a.id === accountId)?.name ?? "—" : "No account (unassigned)"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No account (unassigned)</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-zinc-500">Top-level folder. e.g. Household, Personal, Joint.</p>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Provider</Label>
          <Select value={providerId ?? "__none"} onValueChange={(v) => setProviderId(v === "__none" ? null : v)} disabled={!accountId}>
            <SelectTrigger className="h-11">
              <span className="flex-1 text-left truncate">{providerId ? filteredProviders.find((p) => p.id === providerId)?.name ?? "—" : accountId ? (filteredProviders.length ? "No provider (direct)" : "No providers yet") : "Select account first"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No provider — direct under account</SelectItem>
              {filteredProviders.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-zinc-500">{accountId ? filteredProviders.length ? "Providers live inside this account." : "Create providers from the sidebar — e.g. Vanguard, HL, Trading 212." : "Choose an account to see providers."}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {[
            { id: "live", title: "Live", desc: "Auto-updated prices", icon: TrendingUp },
            { id: "manual", title: "Manual", desc: "Pensions, cash, custom", icon: Layers },
          ].map((o) => (
            <button
              key={o.id}
              onClick={() => setType(o.id as "live" | "manual")}
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
  );

  const holdingsCard = (
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
  );

  const reviewCard = (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2"><Check className="w-5 h-5 text-emerald-400" /> Review</CardTitle>
        <CardDescription>Confirm and create. You can edit everything after.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 text-sm min-[360px]:grid-cols-2">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Name</div><div className="font-medium text-white">{name || "—"}</div></div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Type</div><div className="font-medium text-white capitalize">{type}</div></div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Account</div><div className="font-medium text-white">{accountId ? accounts.find((a) => a.id === accountId)?.name ?? "Unassigned" : "Unassigned"}</div></div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10"><div className="text-xs text-zinc-500">Provider</div><div className="font-medium text-white">{providerId ? filteredProviders.find((p) => p.id === providerId)?.name ?? providers.find((p) => p.id === providerId)?.name ?? "—" : "No provider"}</div></div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 min-[360px]:col-span-2"><div className="text-xs text-zinc-500">First holding</div><div className="font-medium text-white">{symbol ? `${symbol} — ${shares || 0} shares` : "None (skip)"}</div></div>
        </div>
      </CardContent>
    </Card>
  );

  const stepper = (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`px-2.5 py-1 rounded-full border ${step >= 1 ? "bg-white text-black border-white" : "border-white/10"}`}>1 Details</span>
      <span className="flex-1 h-px bg-white/10" />
      <span className={`px-2.5 py-1 rounded-full border ${step >= 2 ? "bg-white text-black border-white" : "border-white/10"}`}>2 Holdings</span>
      <span className="flex-1 h-px bg-white/10" />
      <span className={`px-2.5 py-1 rounded-full border ${step >= 3 ? "bg-white text-black border-white" : "border-white/10"}`}>3 Review</span>
    </div>
  );

  const footer = (bg: string) => (
    <div className={`p-4 border-t border-white/10 flex items-center justify-between ${bg}`}>
      <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : close())} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> {step === 1 ? "Cancel" : "Back"}
      </Button>
      <div className="flex gap-2">
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-2 min-w-28">
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={() => void handleCreate()} disabled={!canNext || creating} className="gap-2 min-w-28">
            <Check className="w-4 h-4" /> {creating ? "Creating…" : "Create portfolio"}
          </Button>
        )}
      </div>
    </div>
  );

  const errorBanner = error ? <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</p> : null;

  if (inline) {
    return (
      <div className="w-full max-w-2xl mx-auto my-8 rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
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
        <div className="p-6 space-y-6">
          {stepper}
          {errorBanner}
          {step === 1 && detailsCard}
          {step === 2 && holdingsCard}
          {step === 3 && reviewCard}
        </div>
        {footer("bg-zinc-950")}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
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
          {stepper}
          {errorBanner}
          {step === 1 && detailsCard}
          {step === 2 && holdingsCard}
          {step === 3 && reviewCard}
        </div>
      </div>
      {footer("bg-black")}
    </div>
  );
}

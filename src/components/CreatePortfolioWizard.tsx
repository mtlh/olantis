"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ProviderPicker, type ProviderSelection } from "@/components/ProviderPicker";
import { Account, Provider } from "@/lib/store";
import { ArrowLeft, ArrowRight, Briefcase, Check, Layers, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
  providers?: Provider[];
  defaultAccountId?: string | null;
  defaultProviderId?: string | null;
  onCreate: (name: string, type: "live" | "manual", accountId: string | null, providerId: string | null, extra?: { symbol?: string; shares?: string }) => void | Promise<void>;
  /** Lets the wizard bootstrap its first account instead of dead-ending. */
  onCreateAccount?: (name: string) => Promise<{ id: string } | void>;
  inline?: boolean;
};

const steps = ["Details", "Holdings", "Review"];

function StepHeading({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-zinc-300">
        <Icon className="size-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

export function CreatePortfolioWizard({ open, onOpenChange, accounts, providers = [], defaultAccountId, defaultProviderId, onCreate, onCreateAccount, inline }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<"live" | "manual">("live");
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId ?? null);
  const [provider, setProvider] = useState<ProviderSelection | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const prevDefaultsRef = useRef<{ accountId: string | null | undefined; providerId: string | null | undefined }>({ accountId: undefined, providerId: undefined });
  useEffect(() => {
    if (open && (prevDefaultsRef.current.accountId !== defaultAccountId || prevDefaultsRef.current.providerId !== defaultProviderId)) {
      setAccountId(defaultAccountId ?? null);
      const preselected = defaultProviderId ? providers.find((item) => item.id === defaultProviderId) ?? null : null;
      setProvider(preselected ? { id: preselected.id, name: preselected.name } : null);
    }
    prevDefaultsRef.current = { accountId: defaultAccountId, providerId: defaultProviderId };
  }, [open, defaultAccountId, defaultProviderId, providers]);

  const accountProviders = useMemo(() => (accountId ? providers.filter((item) => item.accountId === accountId) : []), [providers, accountId]);

  const selectAccount = (value: string) => {
    setAccountId(value);
    // A provider belongs to exactly one account.
    if (provider?.id && !providers.some((item) => item.id === provider.id && item.accountId === value)) {
      setProvider(null);
    }
  };

  const createAccount = async () => {
    const trimmed = newAccountName.trim();
    if (trimmed.length < 2 || !onCreateAccount) return;
    setCreatingAccount(true);
    setError("");
    try {
      const created = await onCreateAccount(trimmed);
      if (created && "id" in created && created.id) setAccountId(created.id);
      setNewAccountName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingAccount(false);
    }
  };

  if (!open) return null;
  const hasLocation = !!accountId;
  const canNext = step !== 1 || (name.trim().length >= 2 && hasLocation);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const providerId = provider?.id ?? null;
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

  const detailsStep = (
    <div className="space-y-7">
      <StepHeading icon={Wallet} title="Portfolio details" description="Name the portfolio and assign it to the account that holds it." />

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="pname">Portfolio name</Label>
          <Input
            id="pname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Growth, Income, ISA Wrapper"
            autoFocus
            maxLength={32}
            className="h-11 rounded-xl border-white/[.12] bg-black/20 px-3.5 text-sm placeholder:text-zinc-600 focus-visible:border-white/25 focus-visible:ring-white/10"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>2–32 characters.</span>
            <span aria-live="polite" className="tabular-nums">{name.length}/32</span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portfolio-account">Account</Label>
            {accounts.length === 0 && onCreateAccount ? (
              <>
                <div className="flex gap-2">
                  <Input
                    id="portfolio-account"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void createAccount(); }}
                    placeholder="e.g. Household"
                    maxLength={64}
                    className="h-11 rounded-xl border-white/[.12] bg-black/20 px-3.5 text-sm placeholder:text-zinc-600 focus-visible:border-white/25 focus-visible:ring-white/10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void createAccount()}
                    disabled={creatingAccount || newAccountName.trim().length < 2}
                    className="h-11 shrink-0 rounded-xl border-white/[.12] bg-white/[.04] px-3 text-zinc-200 hover:bg-white/[.08]"
                  >
                    {creatingAccount ? "Creating…" : "Create"}
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-zinc-500">Create the top-level folder first, like Household or Personal.</p>
              </>
            ) : (
              <>
                <Select value={accountId ?? ""} onValueChange={(v) => selectAccount(v ?? "")} disabled={accounts.length === 0}>
                  <SelectTrigger id="portfolio-account" className="h-11 w-full rounded-xl border-white/[.12] bg-black/20 px-3.5">
                    <span className="flex flex-1 items-center gap-2 truncate text-left">
                      {accountId ? accounts.find((a) => a.id === accountId)?.name ?? "—" : <span className="text-zinc-600">{accounts.length === 0 ? "No accounts yet" : "Select an account"}</span>}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-zinc-500">
                  {accounts.length === 0 ? "Create an account from the sidebar first." : "The top-level folder, like Personal or Joint."}
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="portfolio-provider" className="flex items-center gap-1.5"><Briefcase className="size-3.5" /> Provider <span className="font-normal text-zinc-500">(optional)</span></Label>
            <ProviderPicker
              id="portfolio-provider"
              value={provider}
              onChange={setProvider}
              providers={accountProviders}
              disabled={!accountId}
            />
            <p className="text-xs leading-relaxed text-zinc-500">
              {!accountId
                ? "Choose an account to see its providers."
                : accountProviders.length === 0
                  ? "No providers in this account yet."
                  : "The broker or platform that holds it."}
            </p>
          </div>
        </div>

        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium text-zinc-200">Portfolio type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "live", title: "Live portfolio", desc: "Market prices update automatically", icon: TrendingUp },
              { id: "manual", title: "Manual portfolio", desc: "For pensions, cash, and custom assets", icon: Layers },
            ].map((option) => {
              const selected = type === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setType(option.id as "live" | "manual")}
                  className={`group flex min-h-[88px] items-center gap-3.5 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${selected ? "border-white/25 bg-white/[.075] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" : "border-white/[.09] bg-white/[.025] hover:border-white/[.16] hover:bg-white/[.045]"}`}
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-lg border transition-colors ${selected ? "border-white/15 bg-white text-zinc-950" : "border-white/[.08] bg-black/20 text-zinc-400 group-hover:text-zinc-200"}`}>
                    <option.icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">{option.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{option.desc}</span>
                  </span>
                  <span className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${selected ? "border-white bg-white text-zinc-950" : "border-white/20 text-transparent"}`}>
                    {selected && <Check className="size-3" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );

  const holdingsStep = (
    <div className="space-y-7">
      <StepHeading icon={Layers} title="Add your first holding" description="Start with one asset, or skip this and add holdings from your dashboard later." />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="holding-symbol">Symbol <span className="font-normal text-zinc-500">(optional)</span></Label>
            <Input id="holding-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL, VWRP" className="h-11 rounded-xl border-white/[.12] bg-black/20 px-3.5 text-sm placeholder:text-zinc-600" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="holding-shares">Shares</Label>
            <Input id="holding-shares" type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="e.g. 10" className="h-11 rounded-xl border-white/[.12] bg-black/20 px-3.5 text-sm placeholder:text-zinc-600" />
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-white/[.025] p-4">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-zinc-400">Live portfolios fetch current prices when refreshed. You can add or edit holdings at any time.</p>
        </div>
      </div>
    </div>
  );

  const reviewStep = (
    <div className="space-y-7">
      <StepHeading icon={Check} title="Review your portfolio" description="Everything look right? You can update these details at any time." />
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Portfolio name", value: name || "—" },
          { label: "Type", value: type === "live" ? "Live portfolio" : "Manual portfolio" },
          { label: "Account", value: accountId ? accounts.find((a) => a.id === accountId)?.name ?? "Unassigned" : "Unassigned" },
          { label: "Provider", value: provider?.name ?? "—" },
          { label: "First holding", value: symbol ? `${symbol.toUpperCase()} · ${shares || 0} shares` : "None — add later" },
        ].map((item, index) => (
          <div key={item.label} className={`min-w-0 rounded-xl border border-white/[.08] bg-white/[.025] px-4 py-3.5 ${index === 4 ? "sm:col-span-2" : ""}`}>
            <dt className="text-xs text-zinc-500">{item.label}</dt>
            <dd className="mt-1.5 truncate text-sm font-medium text-zinc-100">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const stepper = (
    <div className="grid grid-cols-3 gap-3" aria-label="Portfolio setup progress" role="list">
      {steps.map((label, index) => {
        const itemStep = index + 1;
        const current = step === itemStep;
        const complete = step > itemStep;
        return (
          <div key={label} role="listitem" aria-current={current ? "step" : undefined}>
            <div className={`h-1 rounded-full ${current || complete ? "bg-white" : "bg-white/[.08]"}`} />
            <div className={`mt-2.5 flex items-center gap-2 text-xs font-medium ${current || complete ? "text-zinc-100" : "text-zinc-600"}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] ${current ? "border-white bg-white text-zinc-950" : complete ? "border-white/20 bg-white/[.08] text-white" : "border-white/10 text-zinc-600"}`}>
                {complete ? <Check className="size-3" aria-hidden="true" /> : itemStep}
              </span>
              <span>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const errorBanner = error ? <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[.08] px-3.5 py-3 text-sm text-red-300">{error}</p> : null;
  const content = step === 1 ? detailsStep : step === 2 ? holdingsStep : reviewStep;

  const wizard = (
    <section className="rounded-2xl border border-white/[.09] bg-[#0b0b0d]/85 shadow-[0_24px_80px_rgba(0,0,0,.42)] backdrop-blur-xl">
      <div className="rounded-t-2xl border-b border-white/[.07] px-5 py-5 sm:px-7">
        {stepper}
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
        {errorBanner}
        {content}
      </div>

      <div className="flex min-h-[76px] items-center justify-between gap-4 rounded-b-2xl border-t border-white/[.07] bg-white/[.012] px-4 py-3.5 sm:px-7">
        <div className="min-w-0">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="-ml-2 gap-2 text-zinc-400 hover:text-white">
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <p className="hidden text-xs text-zinc-600 sm:block">Your details can be changed later.</p>
          )}
        </div>
        <Button
          onClick={() => step < 3 ? setStep(step + 1) : void handleCreate()}
          disabled={!canNext || (step === 3 && creating)}
          className="h-10 gap-2 rounded-xl bg-white px-4 font-medium text-black shadow-[0_4px_18px_rgba(255,255,255,.08)] hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {step === 3 ? (creating ? "Creating…" : "Create portfolio") : "Continue"}
          {step === 3 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </div>
    </section>
  );

  const page = (
    <main className="relative mx-auto w-full max-w-3xl py-2 sm:py-6">
      <div className="pointer-events-none absolute -top-16 left-1/3 -z-10 h-48 w-2/3 rounded-full bg-white/[.025] blur-3xl" />
      <header className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Portfolio setup</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Create a portfolio</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500">Set up a home for your investments, savings, or pension.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={close} className="mb-0.5 shrink-0 text-zinc-400 hover:text-white">Cancel</Button>
      </header>
      {wizard}
    </main>
  );

  if (inline) return <div className="mx-auto my-3 w-full px-0 sm:my-5">{page}</div>;
  return <div className="flex min-h-dvh items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-12">{page}</div>;
}

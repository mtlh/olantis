"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { Account, Portfolio, Provider } from "@/lib/store";

type PortfolioUpdate = {
  name: string;
  type: Portfolio["type"];
  accountId: string | null;
  providerId: string | null;
};

type EditPortfolioDialogProps = {
  portfolio: Portfolio;
  accounts: Account[];
  providers: Provider[];
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, update: PortfolioUpdate) => Promise<void>;
};

const FIELD = "h-10 w-full rounded-lg border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-zinc-600 focus-visible:border-white/25 focus-visible:ring-white/10";
const SECTION_LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500";
const HINT = "text-xs leading-relaxed text-zinc-500";

export function EditPortfolioDialog({ portfolio, accounts, providers, onOpenChange, onSave }: EditPortfolioDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(portfolio.name);
  const [type, setType] = useState<Portfolio["type"]>(portfolio.type);
  const [accountId, setAccountId] = useState(portfolio.accountId ?? "__none");
  const [providerId, setProviderId] = useState(portfolio.providerId ?? "__none");
  const [saving, setSaving] = useState(false);

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.accountId === accountId),
    [providers, accountId],
  );
  const hasAccount = accountId !== "__none";

  const save = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      toast({ title: "Name too short", description: "Use at least 2 characters.", variant: "error" });
      return;
    }

    setSaving(true);
    try {
      await onSave(portfolio.id, {
        name: normalizedName,
        type,
        accountId: hasAccount ? accountId : null,
        providerId: hasAccount && providerId !== "__none" ? providerId : null,
      });
      toast({ title: "Portfolio updated", variant: "success" });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-white/10 bg-zinc-900 p-0 text-white sm:max-w-lg">
        <DialogHeader className="border-b border-white/[0.07] px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
              <Move className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-0.5">
              <DialogTitle>Move portfolio</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-zinc-500">
                Move “{portfolio.name}” to another account or provider, or update its details.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <p className={SECTION_LABEL}>Portfolio details</p>
              <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolio-name">Name</Label>
              <Input
                id="portfolio-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={32}
                autoFocus
                className={FIELD}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "live" as const, title: "Live", desc: "Automatic market prices" },
                  { id: "manual" as const, title: "Manual", desc: "Pensions, cash, custom" },
                ].map((option) => {
                  const selected = type === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setType(option.id)}
                      className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                        selected
                          ? "border-white/25 bg-white/[0.075]"
                          : "border-white/[0.09] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.045]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">{option.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{option.desc}</span>
                      </span>
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? "border-white bg-white text-zinc-950" : "border-white/20 text-transparent"}`}>
                        {selected && <Check className="size-3" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <p className={SECTION_LABEL}>Location</p>
              <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="portfolio-account">Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(value) => {
                    setAccountId(value ?? "__none");
                    setProviderId("__none");
                  }}
                >
                  <SelectTrigger id="portfolio-account" className={FIELD}>
                    <span className="flex-1 truncate text-left">
                      {hasAccount ? accounts.find((account) => account.id === accountId)?.name ?? "—" : "Unassigned"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={HINT}>The top-level folder, like Personal or Joint.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="portfolio-provider">Provider</Label>
                <Select
                  value={providerId}
                  onValueChange={(value) => setProviderId(value ?? "__none")}
                  disabled={!hasAccount}
                >
                  <SelectTrigger id="portfolio-provider" className={FIELD}>
                    <span className="flex-1 truncate text-left">
                      {!hasAccount
                        ? "Select an account first"
                        : providerId === "__none"
                          ? "No provider (direct)"
                          : availableProviders.find((provider) => provider.id === providerId)?.name ?? "—"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No provider — direct under account</SelectItem>
                    {availableProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={HINT}>
                  {!hasAccount
                    ? "Choose an account to see its providers."
                    : availableProviders.length
                      ? "Providers live inside the selected account."
                      : "No providers here yet — add one from the sidebar."}
                </p>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none border-white/[0.07] bg-white/[0.02] px-5 py-3.5">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || name.trim().length < 2}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

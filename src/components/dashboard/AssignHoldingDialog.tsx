"use client";

import { useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { isListedSymbol } from "@/lib/format";
import type { Account, Holding, Portfolio, Provider } from "@/lib/store";

type AssignHoldingDialogProps = {
  holding: Holding;
  portfolios: Portfolio[];
  accounts: Account[];
  providers: Provider[];
  onOpenChange: (open: boolean) => void;
  onCreatePortfolio: (
    name: string,
    type: Portfolio["type"],
    accountId: string | null,
    providerId: string | null,
  ) => Promise<{ id: string }>;
  onMoveHolding: (holdingId: string, portfolioId: string) => Promise<void>;
  onRefreshPortfolios: () => Promise<void>;
  onRefreshHoldings: () => Promise<void>;
};

export function AssignHoldingDialog({
  holding,
  portfolios,
  accounts,
  providers,
  onOpenChange,
  onCreatePortfolio,
  onMoveHolding,
  onRefreshPortfolios,
  onRefreshHoldings,
}: AssignHoldingDialogProps) {
  const { toast } = useToast();
  const [target, setTarget] = useState(portfolios.length ? "__pick__" : "__new__");
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(holding.accountId ?? "__none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const assign = async () => {
    if (target === "__pick__") {
      setError("Choose a portfolio, or create a new one");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let portfolioId = target;
      let portfolioName = "";

      if (target === "__new__") {
        const normalizedName = name.trim();
        if (normalizedName.length < 2) {
          setError("Portfolio name must be at least 2 characters");
          return;
        }

        const selectedAccountId = accountId === "__none" ? null : accountId;
        const providerId = selectedAccountId && holding.providerId
          && providers.find((provider) => provider.id === holding.providerId)?.accountId === selectedAccountId
          ? holding.providerId
          : null;
        const created = await onCreatePortfolio(
          normalizedName,
          isListedSymbol(holding.symbol) ? "live" : "manual",
          selectedAccountId,
          providerId,
        );
        portfolioId = created.id;
        portfolioName = normalizedName;
      } else {
        portfolioName = portfolios.find((portfolio) => portfolio.id === portfolioId)?.name ?? "";
      }

      await onMoveHolding(holding.id, portfolioId);
      await onRefreshPortfolios();
      await onRefreshHoldings();
      toast({ title: "Added to portfolio", description: `${holding.symbol} → ${portfolioName}`, variant: "success" });
      onOpenChange(false);
    } catch (cause: unknown) {
      toast({
        title: "Could not add to portfolio",
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedAccountName = accounts.find((account) => account.id === accountId)?.name;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderPlus className="w-4 h-4" /> Add {holding.symbol} to a portfolio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 leading-relaxed">Group this holding with others in a portfolio. Its trades move with it either way.</p>
          {portfolios.length > 0 && (
            <div className="space-y-1.5">
              <Label>Portfolio</Label>
              <Select value={target} onValueChange={(value) => { setTarget(value ?? "__pick__"); setError(""); }}>
                <SelectTrigger className="h-10 bg-white/5 border-white/10">
                  <span className="flex-1 text-left truncate text-sm">
                    {target === "__new__" ? "Create a new portfolio…" : target === "__pick__" ? "Choose a portfolio…" : portfolios.find((portfolio) => portfolio.id === target)?.name ?? "—"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__">Choose a portfolio…</SelectItem>
                  {portfolios.map((portfolio) => <SelectItem key={portfolio.id} value={portfolio.id}>{portfolio.name}</SelectItem>)}
                  <SelectItem value="__new__">Create a new portfolio…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {target === "__new__" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. ISA — Growth" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "__none")}>
                  <SelectTrigger className="h-10 bg-white/5 border-white/10">
                    <span className="flex-1 text-left truncate text-sm">{accountId === "__none" ? "No account" : selectedAccountName ?? "—"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No account</SelectItem>
                    {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">
                  Creates a {isListedSymbol(holding.symbol) ? "live" : "manual"} portfolio
                  {accountId === "__none" ? "" : ` under ${selectedAccountName ?? ""}`}.
                </p>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void assign()} disabled={saving || target === "__pick__"}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
            {target === "__new__" ? "Create & add" : "Add to portfolio"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

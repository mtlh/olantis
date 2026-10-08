"use client";

import { useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function EditPortfolioDialog({ portfolio, accounts, providers, onOpenChange, onSave }: EditPortfolioDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(portfolio.name);
  const [type, setType] = useState<Portfolio["type"]>(portfolio.type);
  const [accountId, setAccountId] = useState(portfolio.accountId ?? "__none");
  const [providerId, setProviderId] = useState(portfolio.providerId ?? "__none");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      toast({ title: "Name too short", variant: "error" });
      return;
    }

    setSaving(true);
    try {
      await onSave(portfolio.id, {
        name: normalizedName,
        type,
        accountId: accountId === "__none" ? null : accountId,
        providerId: providerId === "__none" ? null : providerId,
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
      <DialogContent className="bg-zinc-900 border-white/10 text-white">
        <DialogHeader><DialogTitle>Edit portfolio</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType((value ?? "live") as Portfolio["type"])}>
              <SelectTrigger><span className="flex-1 text-left">{type === "live" ? "Live" : "Manual"}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={(value) => { setAccountId(value ?? "__none"); setProviderId("__none"); }}>
              <SelectTrigger>
                <span className="flex-1 text-left truncate">{accountId === "__none" ? "Unassigned" : accounts.find((account) => account.id === accountId)?.name ?? "—"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned</SelectItem>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Provider</Label>
            <Select value={providerId} onValueChange={(value) => setProviderId(value ?? "__none")} disabled={accountId === "__none"}>
              <SelectTrigger>
                <span className="flex-1 text-left truncate">{providerId === "__none" ? "No provider" : providers.find((provider) => provider.id === providerId)?.name ?? "—"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No provider</SelectItem>
                {providers.filter((provider) => provider.accountId === accountId).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

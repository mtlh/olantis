"use client";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { type Holding } from "@/lib/store";
import { fmtPrice } from "@/lib/format";
import { TrendingUp, Plus, Minus, Calculator, Calendar, Hash } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  holding: Holding | null;
  type: "buy" | "sell";
  onSubmit: (data: { shares: number; price: number; date: string }) => Promise<void>;
};

type BuyPreview = { kind: "buy"; newShares: number; newAvg: number; newCost: number; newValue: number; costDelta: number };
type SellPreview = { kind: "sell"; newShares: number; proceeds: number; pl: number; remaining: number };
type PreviewError = { kind: "error"; error: string };
type Preview = BuyPreview | SellPreview | PreviewError | null;

export function TradeDialog({ open, onOpenChange, holding, type, onSubmit }: Props) {
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState(() => (holding ? String(holding.currentPrice) : ""));
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const s = Number(shares);
  const p = Number(price);
  const hasValues = s > 0 && p > 0;

  const preview: Preview = useMemo(() => {
    if (!holding || !hasValues) return null;
    if (type === "buy") {
      const newShares = holding.shares + s;
      const newAvg = (holding.shares * holding.avgPrice + s * p) / newShares;
      const newCost = newShares * newAvg;
      const newValue = newShares * holding.currentPrice;
      return { kind: "buy", newShares, newAvg, newCost, newValue, costDelta: s * p };
    }
    if (s > holding.shares) return { kind: "error", error: `You only hold ${holding.shares} shares` };
    const newShares = holding.shares - s;
    const proceeds = s * p;
    const costBasis = s * holding.avgPrice;
    const pl = proceeds - costBasis;
    return { kind: "sell", newShares, proceeds, pl, remaining: newShares };
  }, [holding, s, p, type, hasValues]);

  const submit = async () => {
    if (!s || s <= 0) return setError("Shares must be > 0");
    if (!p || p <= 0) return setError("Price must be > 0");
    if (type === "sell" && holding && s > holding.shares) return setError(`Cannot sell ${s} — you hold ${holding.shares}`);
    setSaving(true);
    try {
      await onSubmit({ shares: s, price: p, date });
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!holding && type === "sell") return null;
  const cur = holding?.currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg grid place-items-center ${type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {type === "buy" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </span>
            {type === "buy" ? "Buy" : "Sell"} {holding ? holding.symbol : ""}
            {holding && <Badge variant="outline" className="border-white/10 text-zinc-400 ml-1">{holding.shares} × {fmtPrice(holding.avgPrice, cur)} avg</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {holding && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/5 text-center">
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-500">Shares</div><div className="text-sm font-semibold text-white">{holding.shares}</div></div>
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-500">Avg cost</div><div className="text-sm font-semibold text-white">{fmtPrice(holding.avgPrice, cur)}</div></div>
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-500">Price</div><div className="text-sm font-semibold text-white">{fmtPrice(holding.currentPrice, cur)}</div></div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Hash className="w-3 h-3" /> Shares *</Label>
              <Input type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="e.g. 10" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">Price / share *</Label>
              <Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 106.40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Date</Label>
            <Input type="date" value={date} max={new Date().toISOString().split("T")[0]} onChange={(e) => setDate(e.target.value)} />
          </div>

          {preview?.kind === "buy" && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><Calculator className="w-3.5 h-3.5" /> Dollar-cost averaging preview</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-black/20"><div className="text-zinc-500">New avg cost</div><div className="font-semibold text-white">{fmtPrice(preview.newAvg, cur)}</div><div className="text-zinc-600 text-[11px]">was {fmtPrice(holding!.avgPrice, cur)}</div></div>
                <div className="p-2 rounded-lg bg-black/20"><div className="text-zinc-500">New holding</div><div className="font-semibold text-white">{preview.newShares} shares</div><div className="text-zinc-600 text-[11px]">+{s} shares • {fmtPrice(preview.costDelta, cur)} cost</div></div>
              </div>
              {p < holding!.avgPrice && <p className="text-xs text-emerald-300">Buying below your average — your avg cost will decrease ↓</p>}
              {p > holding!.avgPrice && <p className="text-xs text-amber-300">Buying above your average — your avg cost will increase ↑</p>}
            </div>
          )}

          {preview?.kind === "sell" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400"><Calculator className="w-3.5 h-3.5" /> Sale preview</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-black/20"><div className="text-zinc-500">Proceeds</div><div className="font-semibold text-white">{fmtPrice(preview.proceeds, cur)}</div><div className={`text-[11px] ${preview.pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{preview.pl >= 0 ? "+" : ""}{fmtPrice(preview.pl, cur)} P/L</div></div>
                <div className="p-2 rounded-lg bg-black/20"><div className="text-zinc-500">Remaining</div><div className="font-semibold text-white">{preview.newShares} shares</div><div className="text-zinc-600 text-[11px]">{preview.newShares === 0 ? "Position closed" : `${preview.newShares} × ${fmtPrice(holding!.avgPrice, cur)} avg`}</div></div>
              </div>
            </div>
          )}

          {preview?.kind === "error" && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{preview.error}</p>}
          {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</p>}
          <div className="flex items-center gap-2 text-xs text-zinc-500"><TrendingUp className="w-3 h-3" /> Uses weighted average. Chart will mark this trade.</div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving || !hasValues} className={type === "buy" ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : "bg-red-600 hover:bg-red-700 text-white border-red-600"}>
            {saving ? "Saving…" : type === "buy" ? <><Plus className="w-4 h-4" /> Buy {s ? `${s} @ ${fmtPrice(p, cur)}` : ""}</> : <><Minus className="w-4 h-4" /> Sell {s ? `${s} @ ${fmtPrice(p, cur)}` : ""}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

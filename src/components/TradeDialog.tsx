"use client";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogActions } from "@/components/shared/DialogActions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Holding } from "@/lib/store";
import { fmtPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, Plus, Minus, Calculator, Calendar, Hash } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  holding: Holding | null;
  type: "buy" | "sell";
  onSubmit: (data: { shares: number; price: number; date: string }) => Promise<void>;
};

type BuyPreview = { kind: "buy"; ready: boolean; newShares: number; newAvg: number; costDelta: number };
type SellPreview = { kind: "sell"; ready: boolean; newShares: number; proceeds: number; pl: number; overSell: boolean };
type Preview = BuyPreview | SellPreview | null;

/**
 * One result cell. Every cell keeps the same three rows (label, value, hint)
 * and truncates its hint, so the panel never changes height while the user
 * types — the dialog must not jump around as the preview fills in.
 */
function PreviewTile({ label, value, hint, hintClassName }: { label: string; value: string; hint: string; hintClassName?: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <div className="text-[11px] leading-4 text-zinc-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums leading-5 text-white">{value}</div>
      <div className={cn("mt-0.5 truncate text-[11px] leading-4 tabular-nums text-zinc-400", hintClassName)} title={hint}>
        {hint}
      </div>
    </div>
  );
}

export function TradeDialog({ open, onOpenChange, holding, type, onSubmit }: Props) {
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState(() => (holding ? String(holding.currentPrice) : ""));
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const s = Number(shares);
  const p = Number(price);
  const hasValues = Number.isFinite(s) && Number.isFinite(p) && s > 0 && p > 0;

  const preview: Preview = useMemo(() => {
    if (!holding) return null;
    if (type === "buy") {
      const added = hasValues ? s : 0;
      const newShares = holding.shares + added;
      const newAvg = newShares > 0 ? (holding.shares * holding.avgPrice + added * p) / newShares : holding.avgPrice;
      return { kind: "buy", ready: hasValues, newShares, newAvg, costDelta: added * p };
    }
    const overSell = hasValues && s > holding.shares;
    const sold = hasValues ? s : 0;
    const newShares = Math.max(0, holding.shares - sold);
    return {
      kind: "sell",
      ready: hasValues && !overSell,
      newShares,
      proceeds: sold * p,
      pl: sold * (p - holding.avgPrice),
      overSell,
    };
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
  const submitLabel = `${type === "buy" ? "Buy" : "Sell"}${s ? ` ${s} @ ${fmtPrice(p, cur)}` : ""}`;
  const overSell = preview?.kind === "sell" && preview.overSell;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg grid place-items-center ${type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {type === "buy" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </span>
            {type === "buy" ? "Buy" : "Sell"} {holding ? holding.symbol : ""}
            {holding && <Badge variant="outline" className="border-white/10 text-zinc-400 ml-1 tabular-nums">{holding.shares} × {fmtPrice(holding.avgPrice, cur)} avg</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {holding && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/5 text-center">
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-400">Shares</div><div className="text-sm font-semibold text-white tabular-nums">{holding.shares}</div></div>
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-400">Avg cost</div><div className="text-sm font-semibold text-white tabular-nums">{fmtPrice(holding.avgPrice, cur)}</div></div>
              <div><div className="text-[10px] tracking-widest uppercase text-zinc-400">Price</div><div className="text-sm font-semibold text-white tabular-nums">{fmtPrice(holding.currentPrice, cur)}</div></div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trade-shares" className="flex items-center gap-1.5"><Hash className="w-3 h-3" /> Shares *</Label>
              <Input id="trade-shares" type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="e.g. 10" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-price" className="flex items-center gap-1.5">Price / share *</Label>
              <Input id="trade-price" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 106.40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trade-date" className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Date</Label>
            <Input id="trade-date" type="date" value={date} max={new Date().toISOString().split("T")[0]} onChange={(e) => setDate(e.target.value)} />
          </div>

          {holding && preview?.kind === "buy" && (
            <section
              className={cn(
                "rounded-xl border p-3 transition-colors duration-200",
                preview.ready ? "border-emerald-500/20 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("flex items-center gap-1.5 text-xs font-semibold", preview.ready ? "text-emerald-400" : "text-zinc-300")}>
                  <Calculator className="w-3.5 h-3.5" /> Dollar-cost averaging
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{preview.ready ? "Live" : hasValues ? "Check amount" : "Awaiting input"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PreviewTile
                  label="New avg cost"
                  value={preview.ready ? fmtPrice(preview.newAvg, cur) : "—"}
                  hint={`was ${fmtPrice(holding.avgPrice, cur)}`}
                />
                <PreviewTile
                  label="New holding"
                  value={preview.ready ? plural(preview.newShares, "share") : "—"}
                  hint={preview.ready ? `+${plural(s, "share")} • ${fmtPrice(preview.costDelta, cur)} cost` : `currently ${plural(holding.shares, "share")}`}
                />
              </div>
              <p aria-live="polite" className="mt-2 min-h-4 text-[11px] leading-4">
                {preview.ready ? (
                  p < holding.avgPrice ? <span className="text-emerald-300">Below your average — avg cost will fall ↓</span>
                  : p > holding.avgPrice ? <span className="text-amber-300">Above your average — avg cost will rise ↑</span>
                  : <span className="text-zinc-400">Matches your average — avg cost stays the same</span>
                ) : (
                  <span className="text-zinc-500">Enter shares and a price to preview the impact</span>
                )}
              </p>
            </section>
          )}

          {holding && preview?.kind === "sell" && (
            <section
              className={cn(
                "rounded-xl border p-3 transition-colors duration-200",
                preview.ready || preview.overSell ? "border-red-500/20 bg-red-500/10" : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("flex items-center gap-1.5 text-xs font-semibold", preview.ready || preview.overSell ? "text-red-400" : "text-zinc-300")}>
                  <Calculator className="w-3.5 h-3.5" /> Sale preview
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{preview.ready ? "Live" : hasValues ? "Check amount" : "Awaiting input"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PreviewTile
                  label="Proceeds"
                  value={preview.ready ? fmtPrice(preview.proceeds, cur) : "—"}
                  hint={preview.ready ? `${preview.pl >= 0 ? "+" : ""}${fmtPrice(preview.pl, cur)} P/L` : preview.overSell ? "Not enough shares" : "Add shares and price"}
                  hintClassName={preview.ready ? (preview.pl >= 0 ? "text-emerald-400" : "text-red-400") : undefined}
                />
                <PreviewTile
                  label="Remaining"
                  value={preview.ready ? plural(preview.newShares, "share") : "—"}
                  hint={preview.ready ? (preview.newShares === 0 ? "Position closed" : `${fmtPrice(holding.avgPrice, cur)} avg`) : `currently ${plural(holding.shares, "share")}`}
                />
              </div>
              <p aria-live="polite" className="mt-2 min-h-4 text-[11px] leading-4">
                {preview.overSell ? (
                  <span className="text-red-400">You only hold {plural(holding.shares, "share")}</span>
                ) : preview.ready ? (
                  <span className={preview.pl >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {preview.newShares === 0
                      ? "This sale closes your position"
                      : preview.pl === 0
                        ? "Breaks even on this sale"
                        : `${preview.pl > 0 ? "Gain" : "Loss"} of ${fmtPrice(Math.abs(preview.pl), cur)} on this sale`}
                  </span>
                ) : (
                  <span className="text-zinc-500">Enter shares and a price to preview the impact</span>
                )}
              </p>
            </section>
          )}

          {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</p>}
          <div className="flex items-center gap-2 text-xs text-zinc-400"><TrendingUp className="w-3 h-3" /> Uses weighted average. Chart will mark this trade.</div>
        </div>

        <DialogActions
          className="justify-between"
          onCancel={() => onOpenChange(false)}
          onSubmit={() => void submit()}
          submitLabel={submitLabel}
          submitIcon={type === "buy" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          submitClassName={type === "buy" ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : "bg-red-600 hover:bg-red-700 text-white border-red-600"}
          disabled={!hasValues || overSell}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}

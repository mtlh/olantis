import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDayMonth, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type TradeRowProps = {
  type: "buy" | "sell";
  shares: number;
  price: number;
  /** ISO day ("2026-01-05"). */
  date: string;
  dateFormat: string;
  symbol?: string;
  currency?: string | null;
  showSymbol?: boolean;
  showTotal?: boolean;
  onDelete?: () => void;
  className?: string;
};

/**
 * One trade line, shared by portfolio history, holding detail and the overview
 * feed. Mobile stacks total/date under the description; desktop aligns them.
 */
export function TradeRow({
  type,
  shares,
  price,
  date,
  dateFormat,
  symbol,
  currency,
  showSymbol = true,
  showTotal = true,
  onDelete,
  className,
}: TradeRowProps) {
  const isBuy = type === "buy";
  const total = shares * price;

  return (
    <div className={cn("flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-white/[0.02]", className)}>
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs",
          isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
        )}
      >
        {isBuy ? "+" : "−"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          {showSymbol && symbol && <span className="font-medium text-white">{symbol}</span>}
          <span className={isBuy ? "text-emerald-400" : "text-red-400"}>{isBuy ? "Buy" : "Sell"}</span>
          <span className="tabular-nums text-zinc-400">{shares} @ {fmtPrice(price, currency)}</span>
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-400 sm:hidden">
          {fmtDayMonth(date, dateFormat)}
          {showTotal ? ` · ${fmtPrice(total, currency)}` : ""}
        </div>
      </div>
      {showTotal && (
        <span className="hidden shrink-0 text-xs tabular-nums text-zinc-400 sm:block">{fmtPrice(total, currency)}</span>
      )}
      <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-400 sm:block">
        {fmtDayMonth(date, dateFormat)}
      </span>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-zinc-400 hover:text-red-400"
          title="Delete trade and reverse its position impact"
          aria-label={`Delete ${isBuy ? "buy" : "sell"} of ${symbol ?? "this trade"}`}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

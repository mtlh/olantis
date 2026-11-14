import { fmtRelative } from "@/lib/format";
import type { Holding } from "@/lib/store";

type PriceFreshnessCardProps = {
  staleHoldings: Holding[];
  dateFormat: string;
  onSelectHolding: (holding: Holding) => void;
};

export function PriceFreshnessCard({ staleHoldings, dateFormat, onSelectHolding }: PriceFreshnessCardProps) {
  const upToDate = staleHoldings.length === 0;

  return (
    <section className="py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${upToDate ? "bg-emerald-400" : "bg-amber-400"}`} />
          <h2 className="text-sm font-medium text-white">Prices</h2>
          <span className="truncate text-[11px] text-zinc-600">{upToDate ? "Up to date" : `${staleHoldings.length} need attention`}</span>
        </div>
      </div>

      {!upToDate && (
        <div className="mt-3 space-y-0.5">
          {staleHoldings.slice(0, 4).map((holding) => (
            <button key={holding.id} type="button" onClick={() => onSelectHolding(holding)} className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-white/[0.04]">
              <span className="min-w-0 truncate text-[11px] text-zinc-300">{holding.symbol} <span className="text-zinc-600">{holding.name}</span></span>
              <span className="shrink-0 text-[10px] text-amber-300/80">{holding.lastRefreshedAt ? fmtRelative(holding.lastRefreshedAt, dateFormat) : "Unverified"}</span>
            </button>
          ))}
          {staleHoldings.length > 4 && <p className="px-1 text-[10px] text-zinc-600">and {staleHoldings.length - 4} more</p>}
        </div>
      )}
    </section>
  );
}

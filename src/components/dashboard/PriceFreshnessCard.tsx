import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRelative } from "@/lib/format";
import type { Holding } from "@/lib/store";

type PriceFreshnessCardProps = {
  staleHoldings: Holding[];
  dateFormat: string;
  refreshing: boolean;
  onSelectHolding: (holding: Holding) => void;
  onRefresh: () => void;
};

export function PriceFreshnessCard({ staleHoldings, dateFormat, refreshing, onSelectHolding, onRefresh }: PriceFreshnessCardProps) {
  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-white">Price freshness</CardTitle>
          <CardDescription className="mt-1">Daily refresh expected around 06:00 UTC.</CardDescription>
        </div>
        <Badge variant="outline" className={staleHoldings.length ? "border-amber-500/20 text-amber-300" : "border-emerald-500/20 text-emerald-300"}>
          {staleHoldings.length} need attention
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {staleHoldings.length ? (
          <>
            <p className="text-xs text-zinc-500">No recent quote refresh is recorded for these positions.</p>
            <div className="space-y-1.5">
              {staleHoldings.slice(0, 4).map((holding) => (
                <button key={holding.id} type="button" onClick={() => onSelectHolding(holding)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]">
                  <span className="min-w-0 truncate text-xs text-zinc-300">{holding.symbol} <span className="text-zinc-600">· {holding.name}</span></span>
                  <span className="shrink-0 text-[10px] text-amber-300">{holding.lastRefreshedAt ? fmtRelative(holding.lastRefreshedAt, dateFormat) : "Unverified"}</span>
                </button>
              ))}
              {staleHoldings.length > 4 && <p className="px-2 text-[10px] text-zinc-600">and {staleHoldings.length - 4} more</p>}
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full border-white/10 bg-white/5" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh prices"}
            </Button>
          </>
        ) : <p className="text-xs text-emerald-300">All tracked market prices have a recent refresh.</p>}
      </CardContent>
    </Card>
  );
}

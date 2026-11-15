"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Download, Ellipsis, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/BrandIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveBadge } from "@/components/shared/LiveBadge";
import { SearchField } from "@/components/shared/SearchField";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { fmtGBP, fmtPct, fmtPrice, fmtRelative, fmtTimestamp, holdingCostGBP, holdingCurrency, holdingValueGBP, isLiveHolding, type FxRates } from "@/lib/format";
import type { Holding, Portfolio } from "@/lib/store";

type HoldingSort = "value" | "gain" | "symbol";
type TradeType = "buy" | "sell";

type HoldingsTableProps = {
  portfolio: Portfolio;
  fxRates: FxRates;
  dateFormat: string;
  totalValue: number;
  staleHoldings: Holding[];
  onAdd: () => void;
  onSelect: (holding: Holding) => void;
  onTrade: (holding: Holding, type: TradeType) => void;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
};

const HEAD = "h-8 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400";

export function HoldingsTable({
  portfolio,
  fxRates,
  dateFormat,
  totalValue,
  staleHoldings,
  onAdd,
  onSelect,
  onTrade,
  onEdit,
  onDelete,
}: HoldingsTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HoldingSort>("value");
  // Filtering a long holdings list on every keystroke can block the input.
  // Keep the field immediate and let the table catch up in a lower-priority
  // render.
  const deferredQuery = useDeferredValue(query);

  const staleHoldingIds = useMemo(() => new Set(staleHoldings.map((holding) => holding.id)), [staleHoldings]);
  const rows = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    // Compute value/cost once per row; the previous comparator recomputed them
    // O(n log n) times while sorting.
    const scored = portfolio.holdings
      .filter((holding) => !normalizedQuery
        || holding.symbol.toLowerCase().includes(normalizedQuery)
        || holding.name.toLowerCase().includes(normalizedQuery))
      .map((holding) => ({
        holding,
        value: holdingValueGBP(holding, fxRates),
        cost: holdingCostGBP(holding, fxRates),
      }));

    if (sort === "symbol") return scored.sort((a, b) => a.holding.symbol.localeCompare(b.holding.symbol));
    if (sort === "gain") return scored.sort((a, b) => (b.value - b.cost) - (a.value - a.cost));
    return scored.sort((a, b) => b.value - a.value);
  }, [deferredQuery, fxRates, portfolio.holdings, sort]);

  const exportCsv = () => {
    const rows = ["Symbol,Name,Shares,AvgPrice,CurrentPrice,Value,Gain,PurchaseDate"];
    for (const holding of portfolio.holdings) {
      const value = holdingValueGBP(holding, fxRates);
      const cost = holdingCostGBP(holding, fxRates);
      rows.push([
        holding.symbol,
        holding.name,
        String(holding.shares),
        String(holding.avgPrice),
        String(holding.currentPrice),
        String(value),
        String(value - cost),
        holding.purchaseDate,
      ].map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","));
    }

    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${portfolio.name}-holdings.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-labelledby="holdings-heading">
      <SectionHeading
        id="holdings-heading"
        title="Holdings"
        meta={query ? `${rows.length} of ${portfolio.holdings.length}` : rows.length}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              size="sm"
              label="Search holdings"
              placeholder="Search symbol or name"
              value={query}
              onChange={setQuery}
              className="w-full sm:w-44"
              inputClassName="bg-white/[0.04]"
            />
            <Select value={sort} onValueChange={(value) => setSort(value ?? "value")}>
              <SelectTrigger aria-label="Sort holdings" className="h-8 w-28 bg-white/[0.04] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="gain">Gain</SelectItem>
                <SelectItem value="symbol">Symbol</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={exportCsv} disabled={!portfolio.holdings.length}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          bordered
          title={query ? "No holdings match your search." : "No holdings yet."}
          description={query ? "Try a different symbol or name." : "Add your first position to start tracking it."}
          action={query ? (
            <Button type="button" variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => setQuery("")}>Clear search</Button>
          ) : (
            <Button type="button" size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add holding</Button>
          )}
        />
      ) : (
        <Table className="border-b border-white/[0.06]">
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              <TableHead className={`${HEAD} first:pl-1`}>Asset</TableHead>
              <TableHead className={`${HEAD} hidden md:table-cell`}>Shares · Avg cost</TableHead>
              <TableHead className={`${HEAD} hidden text-right lg:table-cell`}>Current price</TableHead>
              <TableHead className={`${HEAD} hidden text-right xl:table-cell`}>Cost basis</TableHead>
              <TableHead className={`${HEAD} text-right`}>Value</TableHead>
              <TableHead className={`${HEAD} text-right`}><span className="sm:hidden">P/L</span><span className="hidden sm:inline">Unrealized P/L</span></TableHead>
              <TableHead className={`${HEAD} hidden text-right sm:table-cell`}>Weight</TableHead>
              <TableHead className={`${HEAD} hidden text-right 2xl:table-cell`}>Updated</TableHead>
              <TableHead className={`${HEAD} hidden w-10 sm:table-cell`}><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ holding, value, cost }) => {
              const gain = value - cost;
              const returnPct = cost ? (gain / cost) * 100 : 0;
              const weight = totalValue > 0 ? value / totalValue * 100 : 0;
              const stale = staleHoldingIds.has(holding.id);

              return (
                <TableRow key={holding.id} className="cursor-pointer border-white/[0.05] hover:bg-white/[0.025]" onClick={() => onSelect(holding)}>
                  <TableCell className="pl-1">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onSelect(holding); }}
                      className="flex max-w-full items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                    >
                      <span className="sr-only">Open </span>
                      <BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} currency={holding.currency} size={32} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-white">{holding.symbol}</span>
                          {isLiveHolding(holding, portfolio.type) && (
                            <LiveBadge />
                          )}
                        </div>
                        <div className="max-w-[128px] truncate text-[11px] text-zinc-400 sm:max-w-[160px]">{holding.name}</div>
                        <div className="text-[11px] tabular-nums text-zinc-400 md:hidden">{holding.shares} × {fmtPrice(holding.avgPrice, holdingCurrency(holding))}</div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums text-zinc-400 md:table-cell">{holding.shares} × {fmtPrice(holding.avgPrice, holdingCurrency(holding))}</TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums text-zinc-400 lg:table-cell">{fmtPrice(holding.currentPrice, holdingCurrency(holding))}</TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums text-zinc-400 xl:table-cell">{fmtGBP(cost)}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums text-white">{fmtGBP(value)}</TableCell>
                  <TableCell className="text-right">
                    <div className={`text-sm font-medium tabular-nums ${gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {gain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(gain))}
                    </div>
                    <div className="text-[11px] tabular-nums text-zinc-400">{fmtPct(returnPct)}</div>
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums text-zinc-400 sm:table-cell">{weight.toFixed(1)}%</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums 2xl:table-cell" title={holding.lastRefreshedAt ? fmtTimestamp(holding.lastRefreshedAt, dateFormat) : "No refresh recorded"}>
                    {stale
                      ? <span className="text-amber-300/80" title="No recent quote refresh is recorded for this holding">{holding.lastRefreshedAt ? `Stale · ${fmtRelative(holding.lastRefreshedAt, dateFormat)}` : "Unverified"}</span>
                      : <span className="text-zinc-400">{fmtRelative(holding.lastRefreshedAt, dateFormat)}</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" className="text-zinc-400 hover:bg-white/[0.06] hover:text-white data-[popup-open]:bg-white/10 data-[popup-open]:text-white" aria-label={`Actions for ${holding.symbol}`} title="Actions" />}>
                          <Ellipsis className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom" className="min-w-40 border-white/10 bg-zinc-900 text-white">
                          <DropdownMenuItem onClick={() => onTrade(holding, "buy")}><Plus className="h-3.5 w-3.5" />Buy / DCA</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onTrade(holding, "sell")}><Minus className="h-3.5 w-3.5" />Sell</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(holding)}><Pencil className="h-3.5 w-3.5" />Edit holding</DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(holding)}><Trash2 className="h-3.5 w-3.5" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

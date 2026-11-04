"use client";

import { useMemo, useState } from "react";
import { Download, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/BrandIcon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtGBP, fmtPct, fmtPrice, fmtRelative, fmtTimestamp, holdingCostGBP, holdingValueGBP, type FxRates } from "@/lib/format";
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

const HEAD = "h-8 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600";

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

  const staleHoldingIds = useMemo(() => new Set(staleHoldings.map((holding) => holding.id)), [staleHoldings]);
  const filteredHoldings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const holdings = portfolio.holdings.filter((holding) => !normalizedQuery
      || holding.symbol.toLowerCase().includes(normalizedQuery)
      || holding.name.toLowerCase().includes(normalizedQuery));

    if (sort === "symbol") return [...holdings].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return [...holdings].sort((a, b) => {
      const valueA = holdingValueGBP(a, fxRates);
      const valueB = holdingValueGBP(b, fxRates);
      const scoreA = sort === "gain" ? valueA - holdingCostGBP(a, fxRates) : valueA;
      const scoreB = sort === "gain" ? valueB - holdingCostGBP(b, fxRates) : valueB;
      return scoreB - scoreA;
    });
  }, [fxRates, portfolio.holdings, query, sort]);

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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 id="holdings-heading" className="text-sm font-medium text-white">Holdings</h2>
          <span className="text-[11px] tabular-nums text-zinc-600">
            {query ? `${filteredHoldings.length} of ${portfolio.holdings.length}` : filteredHoldings.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or name"
              className="h-8 w-full bg-white/[0.04] pl-8 text-xs sm:w-44"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear holdings search" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Select value={sort} onValueChange={(value) => setSort((value ?? "value") as HoldingSort)}>
            <SelectTrigger className="h-8 w-28 bg-white/[0.04] text-xs"><SelectValue /></SelectTrigger>
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
      </div>

      {filteredHoldings.length === 0 ? (
        <div className="border-y border-white/[0.06] px-4 py-14 text-center">
          <p className="text-sm text-zinc-400">{query ? "No holdings match your search." : "No holdings yet."}</p>
          <p className="mt-1 text-[11px] text-zinc-600">{query ? "Try a different symbol or name." : "Add your first position to start tracking it."}</p>
          {!query && <Button type="button" size="sm" className="mt-4 rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add holding</Button>}
          {query && <Button type="button" variant="ghost" size="sm" className="mt-4 text-zinc-400 hover:text-white" onClick={() => setQuery("")}>Clear search</Button>}
        </div>
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
              <TableHead className={`${HEAD} hidden w-36 sm:table-cell`} aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHoldings.map((holding) => {
              const value = holdingValueGBP(holding, fxRates);
              const cost = holdingCostGBP(holding, fxRates);
              const gain = value - cost;
              const returnPct = cost ? (gain / cost) * 100 : 0;
              const weight = totalValue > 0 ? value / totalValue * 100 : 0;
              const stale = staleHoldingIds.has(holding.id);

              return (
                <TableRow key={holding.id} className="cursor-pointer border-white/[0.05] hover:bg-white/[0.025]" onClick={() => onSelect(holding)}>
                  <TableCell className="pl-1">
                    <div className="flex items-center gap-3">
                      <BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} size={32} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{holding.symbol}</div>
                        <div className="max-w-[128px] truncate text-[11px] text-zinc-500 sm:max-w-[160px]">{holding.name}</div>
                        <div className="text-[11px] tabular-nums text-zinc-600 md:hidden">{holding.shares} × {fmtPrice(holding.avgPrice, holding.currency)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums text-zinc-400 md:table-cell">{holding.shares} × {fmtPrice(holding.avgPrice, holding.currency)}</TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums text-zinc-400 lg:table-cell">{fmtPrice(holding.currentPrice, holding.currency)}</TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums text-zinc-400 xl:table-cell">{fmtGBP(cost)}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums text-white">{fmtGBP(value)}</TableCell>
                  <TableCell className="text-right">
                    <div className={`text-sm font-medium tabular-nums ${gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {gain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(gain))}
                    </div>
                    <div className="text-[11px] tabular-nums text-zinc-600">{fmtPct(returnPct)}</div>
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums text-zinc-400 sm:table-cell">{weight.toFixed(1)}%</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums 2xl:table-cell" title={holding.lastRefreshedAt ? fmtTimestamp(holding.lastRefreshedAt, dateFormat) : "No refresh recorded"}>
                    {stale
                      ? <span className="text-amber-300/80" title="No recent quote refresh is recorded for this holding">{holding.lastRefreshedAt ? `Stale · ${fmtRelative(holding.lastRefreshedAt, dateFormat)}` : "Unverified"}</span>
                      : <span className="text-zinc-500">{fmtRelative(holding.lastRefreshedAt, dateFormat)}</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="xs" className="px-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white" onClick={(event) => { event.stopPropagation(); onTrade(holding, "buy"); }} title="Buy / DCA" aria-label={`Buy ${holding.symbol}`}><Plus className="h-3 w-3" /><span className="hidden sm:inline">Buy</span></Button>
                      <Button type="button" variant="ghost" size="xs" className="px-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white" onClick={(event) => { event.stopPropagation(); onTrade(holding, "sell"); }} title="Sell" aria-label={`Sell ${holding.symbol}`}><Minus className="h-3 w-3" /><span className="hidden sm:inline">Sell</span></Button>
                      <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-500 hover:text-white" onClick={(event) => { event.stopPropagation(); onEdit(holding); }} aria-label={`Edit ${holding.symbol}`}><Pencil className="h-3 w-3" /></Button>
                      <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={(event) => { event.stopPropagation(); onDelete(holding); }} aria-label={`Delete ${holding.symbol}`}><Trash2 className="h-3 w-3" /></Button>
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

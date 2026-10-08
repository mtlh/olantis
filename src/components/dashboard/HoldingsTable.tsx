"use client";

import { useMemo, useState } from "react";
import { Download, Minus, Pencil, Plus, Search, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtGBP, fmtPct, fmtPrice, fmtRelative, holdingCostGBP, holdingValueGBP, type FxRates } from "@/lib/format";
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
    <Card className="glass-card overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b border-white/5">
        <CardTitle className="flex-1 text-white">Holdings</CardTitle>
        <div className="text-[11px] text-zinc-500 hidden lg:block mr-1">Buy / Sell on each row records a trade</div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or name" className="w-44 pl-8 h-8 bg-white/5 border-white/10 text-xs" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear holdings search" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"><X className="w-3 h-3" /></button>}
          </div>
          <Select value={sort} onValueChange={(value) => setSort((value ?? "value") as HoldingSort)}>
            <SelectTrigger className="w-28 h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="gain">Gain</SelectItem>
              <SelectItem value="symbol">Symbol</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-8 bg-white/5 border-white/10" onClick={exportCsv} disabled={!portfolio.holdings.length}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredHoldings.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><Wallet className="w-6 h-6 text-zinc-500" /></div>
            <p className="text-sm text-zinc-400">{query ? "No holdings match your search." : "No holdings yet."}</p>
            <p className="text-xs text-zinc-600 mt-1">{query ? "Try a different search or clear the filter." : "Add your first position to start tracking."}</p>
            {!query && <Button type="button" className="mt-4" onClick={onAdd}><Plus className="w-4 h-4" /> Add holding</Button>}
            {query && <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery("")}>Clear search</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-zinc-500">Asset</TableHead>
                  <TableHead className="text-zinc-500 hidden md:table-cell">Shares • Avg cost</TableHead>
                  <TableHead className="text-right text-zinc-500 hidden lg:table-cell">Current price</TableHead>
                  <TableHead className="text-right text-zinc-500 hidden xl:table-cell">Cost basis</TableHead>
                  <TableHead className="text-right text-zinc-500">Value</TableHead>
                  <TableHead className="text-right text-zinc-500">Unrealized P/L</TableHead>
                  <TableHead className="text-right text-zinc-500 hidden sm:table-cell">Weight</TableHead>
                  <TableHead className="text-right text-zinc-500 hidden 2xl:table-cell">Updated</TableHead>
                  <TableHead className="w-36" />
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
                    <TableRow key={holding.id} className="border-white/5 hover:bg-white/[0.04] cursor-pointer" onClick={() => onSelect(holding)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl grid place-items-center font-bold text-xs bg-white/10 border border-white/10 text-white shrink-0">{holding.symbol.slice(0, 3)}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-white truncate">{holding.symbol}</div>
                            <div className="text-xs text-zinc-500 truncate max-w-[160px]">{holding.name}</div>
                            <div className="text-xs text-zinc-600 md:hidden">{holding.shares} × {fmtPrice(holding.avgPrice, holding.currency)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-400 hidden md:table-cell">{holding.shares} × {fmtPrice(holding.avgPrice, holding.currency)}</TableCell>
                      <TableCell className="text-right text-sm text-zinc-400 tabular-nums hidden lg:table-cell">{fmtPrice(holding.currentPrice, holding.currency)}</TableCell>
                      <TableCell className="text-right text-sm text-zinc-400 tabular-nums hidden xl:table-cell">{fmtGBP(cost)}</TableCell>
                      <TableCell className="text-right font-semibold text-white tabular-nums">{fmtGBP(value)}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums" style={{ color: gain >= 0 ? "#34d399" : "#f87171" }}>{gain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(gain))}</div>
                        <div className="text-[11px] text-zinc-500 tabular-nums">{fmtPct(returnPct)}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-zinc-400 hidden sm:table-cell">{weight.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-xs tabular-nums hidden 2xl:table-cell" title={holding.lastRefreshedAt ? new Date(holding.lastRefreshedAt * 1000).toLocaleString(dateFormat) : "No refresh recorded"}>
                        {stale
                          ? <span className="text-amber-400" title="No recent quote refresh is recorded for this holding">{holding.lastRefreshedAt ? `Stale · ${fmtRelative(holding.lastRefreshedAt, dateFormat)}` : "Unverified"}</span>
                          : <span className="text-zinc-500">{fmtRelative(holding.lastRefreshedAt, dateFormat)}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="xs" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" onClick={(event) => { event.stopPropagation(); onTrade(holding, "buy"); }} title="Buy / DCA"><Plus className="w-3.5 h-3.5" /> Buy</Button>
                          <Button type="button" variant="outline" size="xs" className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" onClick={(event) => { event.stopPropagation(); onTrade(holding, "sell"); }} title="Sell"><Minus className="w-3.5 h-3.5" /> Sell</Button>
                          <Button type="button" variant="ghost" size="icon-xs" onClick={(event) => { event.stopPropagation(); onEdit(holding); }} aria-label={`Edit ${holding.symbol}`}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={(event) => { event.stopPropagation(); onDelete(holding); }} aria-label={`Delete ${holding.symbol}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

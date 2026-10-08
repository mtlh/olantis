import { ArrowDownRight, ArrowUpRight, History, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Holding, Transaction } from "@/lib/store";

type TradeType = "buy" | "sell";

type PortfolioTradeHistoryProps = {
  holdings: Holding[];
  transactions: Transaction[];
  dateFormat: string;
  onTrade: (holding: Holding, type: TradeType) => void;
  onDelete: (transactionId: string) => void;
};

export function PortfolioTradeHistory({ holdings, transactions, dateFormat, onTrade, onDelete }: PortfolioTradeHistoryProps) {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5">
        <CardTitle className="flex items-center gap-2 text-white">
          <History className="w-4 h-4" /> Trade history {transactions.length ? <Badge variant="outline" className="border-white/10 text-zinc-500">{transactions.length}</Badge> : null}
        </CardTitle>
        <div className="text-xs text-zinc-500 hidden sm:block">Buy/sell from Holdings • events marked on the chart</div>
      </CardHeader>
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3"><ShoppingCart className="w-5 h-5 text-zinc-500" /></div>
            <p className="text-sm text-zinc-400">No trades yet</p>
            <p className="text-xs text-zinc-600 mt-1">Use Buy to dollar-cost average, Sell to trim — avg cost updates automatically.</p>
            {holdings.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                {holdings.length === 1 ? (
                  <>
                    <Button type="button" size="sm" variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" onClick={() => onTrade(holdings[0], "buy")}><Plus className="w-3.5 h-3.5" /> Buy {holdings[0].symbol}</Button>
                    <Button type="button" size="sm" variant="outline" className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" onClick={() => onTrade(holdings[0], "sell")}><Minus className="w-3.5 h-3.5" /> Sell {holdings[0].symbol}</Button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">Use the <span className="text-emerald-400 font-medium">Buy</span> / <span className="text-red-400 font-medium">Sell</span> buttons on any holding above to record a trade.</p>
                )}
              </div>
            ) : <p className="text-xs text-zinc-600 mt-3">Add a holding first, then record buys and sells here.</p>}
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[320px] overflow-auto">
            {transactions.slice(0, 50).map((transaction) => (
              <div key={transaction.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${transaction.type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {transaction.type === "buy" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium flex items-center gap-2">
                    <span className={transaction.type === "buy" ? "text-emerald-400" : "text-red-400"}>{transaction.type === "buy" ? "Buy" : "Sell"}</span>
                    {transaction.symbol} • {transaction.shares} @ £{Number(transaction.price).toFixed(2)}
                    <span className="text-zinc-500 font-normal hidden sm:inline">• {transaction.date}</span>
                  </div>
                  <div className="text-xs text-zinc-500">{transaction.type === "buy" ? "DCA updated" : "Proceeds"} £{(transaction.shares * transaction.price).toFixed(2)}</div>
                </div>
                <span className="text-xs text-zinc-600 tabular-nums">{new Date(transaction.date).toLocaleDateString(dateFormat, { month: "short", day: "numeric" })}</span>
                <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" title="Delete trade and reverse its position impact" onClick={() => onDelete(transaction.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

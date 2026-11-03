import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <section aria-labelledby="trade-history-heading">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 id="trade-history-heading" className="text-sm font-medium text-white">Trade history</h2>
        {transactions.length > 0 && <span className="text-[11px] tabular-nums text-zinc-600">{transactions.length} trades</span>}
      </div>

      {transactions.length === 0 ? (
        <div className="border-y border-white/[0.06] px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">No trades yet</p>
          <p className="mt-1 text-[11px] text-zinc-600">Open a holding to record a buy or sell.</p>
          {holdings.length === 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" size="sm" variant="ghost" className="text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => onTrade(holdings[0], "buy")}><Plus className="h-3.5 w-3.5" /> Buy {holdings[0].symbol}</Button>
              <Button type="button" size="sm" variant="ghost" className="text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => onTrade(holdings[0], "sell")}><Minus className="h-3.5 w-3.5" /> Sell {holdings[0].symbol}</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-[320px] divide-y divide-white/[0.05] overflow-auto border-y border-white/[0.06]">
          {transactions.slice(0, 50).map((transaction) => {
            const isBuy = transaction.type === "buy";
            const total = transaction.shares * Number(transaction.price);

            return (
              <div key={transaction.id} className="flex items-center gap-3 px-1 py-2.5">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {isBuy ? "+" : "−"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                    <span className="font-medium text-white">{transaction.symbol}</span>
                    <span className={isBuy ? "text-emerald-400" : "text-red-400"}>{isBuy ? "Buy" : "Sell"}</span>
                    <span className="tabular-nums text-zinc-500">{transaction.shares} @ £{Number(transaction.price).toFixed(2)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-zinc-600 sm:hidden">
                    {new Date(transaction.date).toLocaleDateString(dateFormat, { month: "short", day: "numeric" })} · £{total.toFixed(2)}
                  </div>
                </div>
                <span className="hidden shrink-0 text-xs tabular-nums text-zinc-500 sm:block">£{total.toFixed(2)}</span>
                <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-600 sm:block">
                  {new Date(transaction.date).toLocaleDateString(dateFormat, { month: "short", day: "numeric" })}
                </span>
                <Button type="button" variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" title="Delete trade and reverse its position impact" aria-label={`Delete ${isBuy ? "buy" : "sell"} of ${transaction.symbol}`} onClick={() => onDelete(transaction.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

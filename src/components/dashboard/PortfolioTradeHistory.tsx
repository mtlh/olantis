import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { TradeRow } from "@/components/shared/TradeRow";
import { plural } from "@/lib/format";
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
      <SectionHeading
        id="trade-history-heading"
        title="Trade history"
        meta={transactions.length > 0 ? plural(transactions.length, "trade") : undefined}
        spacing="tight"
      />

      {transactions.length === 0 ? (
        <EmptyState
          bordered
          title="No trades yet"
          description="Open a holding to record a buy or sell."
          action={holdings.length === 1 && (
            <>
              <Button type="button" size="sm" variant="ghost" className="text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => onTrade(holdings[0], "buy")}><Plus className="h-3.5 w-3.5" /> Buy {holdings[0].symbol}</Button>
              <Button type="button" size="sm" variant="ghost" className="text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={() => onTrade(holdings[0], "sell")}><Minus className="h-3.5 w-3.5" /> Sell {holdings[0].symbol}</Button>
            </>
          )}
        />
      ) : (
        <div className="max-h-[320px] divide-y divide-white/[0.05] overflow-auto border-y border-white/[0.06]">
          {transactions.slice(0, 50).map((transaction) => (
            <TradeRow
              key={transaction.id}
              symbol={transaction.symbol}
              type={transaction.type}
              shares={transaction.shares}
              price={Number(transaction.price)}
              date={transaction.date}
              dateFormat={dateFormat}
              onDelete={() => onDelete(transaction.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

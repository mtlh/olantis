import type { ReactNode } from "react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { StockDetail } from "@/components/StockDetail";
import type { Holding } from "@/lib/store";

type IndividualDashboardProps = {
  holding: Holding;
  portfolioId: string | null;
  portfolioValue: number;
  portfolioName?: string;
  color: string;
  onBuy: () => void;
  onSell: () => void;
  onAddToPortfolio: () => void;
  children?: ReactNode;
};

export function IndividualDashboard({
  holding,
  portfolioId,
  portfolioValue,
  portfolioName,
  color,
  onBuy,
  onSell,
  onAddToPortfolio,
  children,
}: IndividualDashboardProps) {
  return (
    <DashboardLevel label={`${holding.symbol} holding`}>
      <StockDetail
        holding={holding}
        portfolioId={portfolioId}
        portfolioValue={portfolioValue}
        portfolioName={portfolioName}
        color={color}
        onBuy={onBuy}
        onSell={onSell}
        onAddToPortfolio={onAddToPortfolio}
      />
      {children}
    </DashboardLevel>
  );
}
